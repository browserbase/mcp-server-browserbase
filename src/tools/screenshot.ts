import { z } from "zod";
import type { Page } from "@browserbasehq/stagehand";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";
import { registerScreenshot } from "../mcp/resources.js";

/**
 * Screenshot
 *
 * This tool is used to take a screenshot of the current page.
 */

/**
 * Parse PNG dimensions from base64 data by reading the IHDR chunk.
 * PNG format: 8-byte signature, then IHDR chunk with width/height as big-endian uint32.
 * Uses pure V8 APIs (atob, Uint8Array, DataView) - no Node.js Buffer.
 */
function parsePngDimensions(base64Data: string): {
  width: number;
  height: number;
} {
  // 32 base64 chars = 24 bytes, enough for PNG header + IHDR dimensions
  const headerBase64 = base64Data.slice(0, 32);
  const binaryString = atob(headerBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Validate PNG signature
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== pngSignature[i]) {
      throw new Error("Invalid PNG signature");
    }
  }

  // Width at bytes 16-19, height at 20-23 (big-endian)
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16, false); // false = big-endian
  const height = view.getUint32(20, false);

  return { width, height };
}

/**
 * Resize an image using OffscreenCanvas and createImageBitmap.
 * This approach bypasses CSP restrictions because it works with raw binary data,
 * not URLs. Uses GPU-accelerated rendering with high-quality smoothing.
 */
async function resizeImageInBrowser(
  page: Page,
  base64Data: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> {
  return await page.evaluate(
    async ({ data, width, height }) => {
      // Decode base64 to binary - works with raw data, no URL involved
      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "image/png" });

      // createImageBitmap works with Blob data directly, bypassing CSP img-src
      const bitmap = await createImageBitmap(blob);

      // OffscreenCanvas doesn't touch the DOM at all
      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get OffscreenCanvas context");
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      // Convert back to base64
      const resultBlob = await offscreen.convertToBlob({ type: "image/png" });
      const arrayBuffer = await resultBlob.arrayBuffer();
      const resultBytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < resultBytes.length; i++) {
        binary += String.fromCharCode(resultBytes[i]);
      }
      return btoa(binary);
    },
    { data: base64Data, width: targetWidth, height: targetHeight },
  );
}

const ScreenshotInputSchema = z.object({
  name: z.string().optional().describe("The name of the screenshot"),
});

type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;

const screenshotSchema: ToolSchema<typeof ScreenshotInputSchema> = {
  name: "browserbase_screenshot",
  description: `Capture a full-page screenshot and return it (and save as a resource).`,
  inputSchema: ScreenshotInputSchema,
};

async function handleScreenshot(
  context: Context,
  params: ScreenshotInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();
      const page = stagehand.context.pages()[0];

      if (!page) {
        throw new Error("No active page available");
      }

      // We're taking a full page screenshot to give context of the entire page, similar to a snapshot
      // Enable Page domain if needed
      await page.sendCDP("Page.enable");

      // Use CDP to capture screenshot
      const { data } = await page.sendCDP<{ data: string }>(
        "Page.captureScreenshot",
        {
          format: "png",
          fromSurface: true,
        },
      );

      // data is already base64 string from CDP
      let screenshotBase64 = data;

      // Scale down image if needed for Claude's vision API
      // Claude constraints: max 1568px on any edge AND max 1.15 megapixels
      // Reference: https://docs.anthropic.com/en/docs/build-with-claude/vision#evaluate-image-size
      const { width, height } = parsePngDimensions(data);
      const pixels = width * height;

      // Track final dimensions for output
      let finalWidth = width;
      let finalHeight = height;

      // Min of: width constraint, height constraint, and megapixel constraint
      const shrink = Math.min(
        1568 / width,
        1568 / height,
        Math.sqrt((1.15 * 1024 * 1024) / pixels),
      );

      // Only resize if we need to shrink (shrink < 1)
      if (shrink < 1) {
        finalWidth = Math.floor(width * shrink);
        finalHeight = Math.floor(height * shrink);

        process.stderr.write(
          `[Screenshot] Scaling image from ${width}x${height} (${(pixels / (1024 * 1024)).toFixed(2)}MP) to ${finalWidth}x${finalHeight} (${((finalWidth * finalHeight) / (1024 * 1024)).toFixed(2)}MP) for Claude vision API\n`,
        );

        // Resize using browser canvas (no sharp dependency needed)
        screenshotBase64 = await resizeImageInBrowser(
          page,
          data,
          finalWidth,
          finalHeight,
        );
      }
      const name = params.name
        ? `screenshot-${params.name}-${new Date()
            .toISOString()
            .replace(/:/g, "-")}`
        : `screenshot-${new Date().toISOString().replace(/:/g, "-")}` +
          context.config.browserbaseProjectId;

      // Associate with current mcp session id and store in memory /src/mcp/resources.ts
      const sessionId = context.currentSessionId;
      registerScreenshot(sessionId, name, screenshotBase64);

      // Notify the client that the resources changed
      const serverInstance = context.getServer();

      if (serverInstance) {
        await serverInstance.notification({
          method: "notifications/resources/list_changed",
        });
      }

      return {
        content: [
          {
            type: "text",
            text: `Screenshot taken with name: ${name} (${finalWidth}x${finalHeight})`,
          },
          {
            type: "image",
            data: screenshotBase64,
            mimeType: "image/png",
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to take screenshot: ${errorMsg}`);
    }
  };

  return {
    action,
    waitForNetwork: false,
  };
}

const screenshotTool: Tool<typeof ScreenshotInputSchema> = {
  capability: "core",
  schema: screenshotSchema,
  handle: handleScreenshot,
};

export default screenshotTool;
