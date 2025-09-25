import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";
import { registerScreenshot } from "../mcp/resources.js";

const ScreenshotInputSchema = z.object({
  name: z.string().optional().describe("The name of the screenshot"),
});

type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;

const screenshotSchema: ToolSchema<typeof ScreenshotInputSchema> = {
  name: "browserbase_screenshot",
  description:
    "Takes a screenshot of the current page. Use this tool to learn where you are on the page when controlling the browser with Stagehand. Only use this tool when the other tools are not sufficient to get the information you need.",
  inputSchema: ScreenshotInputSchema,
};

async function handleScreenshot(
  context: Context,
  params: ScreenshotInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const page = await context.getActivePage();
      if (!page) {
        throw new Error("No active page available");
      }

      const screenshotBuffer = await page.screenshot({
        fullPage: false,
      });

      // Convert buffer to base64 string and store in memory
      const screenshotBase64 = screenshotBuffer.toString("base64");
      const name = params.name
        ? `screenshot-${params.name}-${new Date()
            .toISOString()
            .replace(/:/g, "-")}`
        : `screenshot-${new Date().toISOString().replace(/:/g, "-")}` +
          context.config.browserbaseProjectId;
      // Associate with current session id and store in memory
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
