import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const NavigateInputSchema = z.object({
  url: z.string().describe("The URL to navigate to"),
});

type NavigateInput = z.infer<typeof NavigateInputSchema>;

const navigateSchema: ToolSchema<typeof NavigateInputSchema> = {
  name: "browserbase_stagehand_navigate",
  description:
    "Navigate to a URL in the browser. Only use this tool with URLs you're confident will work and stay up to date. Otherwise, use https://google.com as the starting point",
  inputSchema: NavigateInputSchema,
};

async function handleNavigate(
  context: Context,
  params: NavigateInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();
      const page = await context.getActivePage();

      if (!page) {
        throw new Error("No active page available");
      }
      await page.goto(params.url, { waitUntil: "domcontentloaded" });

      const sessionId = stagehand.browserbaseSessionID;
      if (!sessionId) {
        throw new Error("No Browserbase session ID available");
      }

      return {
        content: [
          {
            type: "text",
            text: `Navigated to: ${params.url}`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to navigate: ${errorMsg}`);
    }
  };

  return {
    action,
    waitForNetwork: false,
  };
}

const navigateTool: Tool<typeof NavigateInputSchema> = {
  capability: "core",
  schema: navigateSchema,
  handle: handleNavigate,
};

export default navigateTool;
