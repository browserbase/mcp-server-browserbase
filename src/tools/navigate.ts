import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const NavigateInputSchema = z.object({
  url: z.string().min(1),
});

type NavigateInput = z.infer<typeof NavigateInputSchema>;

const navigateSchema: ToolSchema<typeof NavigateInputSchema> = {
  name: "navigate",
  description: "Navigate to a URL",
  inputSchema: NavigateInputSchema,
};

async function handleNavigate(
  context: Context,
  params: NavigateInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();

      const pages = stagehand.context.pages();
      const page = pages[0];

      if (!page) {
        throw new Error("No active page available");
      }
      await page.goto(params.url, { waitUntil: "domcontentloaded" });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              data: { url: params.url },
            }),
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
