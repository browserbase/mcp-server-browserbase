import { z } from "zod";
import sharp from "sharp";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";
import { registerScreenshot } from "../mcp/resources.js";

/**
 * Screenshot
 *
 * This tool is used to take a screenshot of the current page.
 */

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
      const imageBuffer = Buffer.from(data, "base64");
      const metadata = await sharp(imageBuffer).metadata();

      if (metadata.width && metadata.height) {
        const pixels = metadata.width * metadata.height;

        // Min of: width constraint, height constraint, and megapixel constraint
        const shrink = Math.min(
          1568 / metadata.width,
          1568 / metadata.height,
          Math.sqrt((1.15 * 1024 * 1024) / pixels),
        );

        // Only resize if we need to shrink (shrink < 1)
        if (shrink < 1) {
          const newWidth = Math.floor(metadata.width * shrink);
          const newHeight = Math.floor(metadata.height * shrink);

          process.stderr.write(
            `[Screenshot] Scaling image from ${metadata.width}x${metadata.height} (${(pixels / (1024 * 1024)).toFixed(2)}MP) to ${newWidth}x${newHeight} (${((newWidth * newHeight) / (1024 * 1024)).toFixed(2)}MP) for Claude vision API\n`,
          );

          const resizedBuffer = await sharp(imageBuffer)
            .resize(newWidth, newHeight, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer();

          screenshotBase64 = resizedBuffer.toString("base64");
        }
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
        serverInstance.notification({
          method: "notifications/resources/list_changed",
        });
      }

      return {
        content: [
          {
            type: "text",
            text: `Screenshot taken with name: ${name}`,
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
