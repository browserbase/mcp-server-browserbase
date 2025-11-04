import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";
import { registerScreenshot } from "../mcp/resources.js";

/**
 * Screenshot
 * Docs: https://playwright.dev/docs/screenshots
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
      const screenshotBuffer = await page.screenshot({
        fullPage: true,
      });

      // Convert buffer to base64 string and store in memory
      const screenshotBase64 = screenshotBuffer.toString("base64");
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
