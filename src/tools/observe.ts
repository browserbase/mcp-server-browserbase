import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const ObserveInputSchema = z.object({
  instruction: z.string().min(1),
});

type ObserveInput = z.infer<typeof ObserveInputSchema>;

const observeSchema: ToolSchema<typeof ObserveInputSchema> = {
  name: "observe",
  description: "Observe actionable elements on the page",
  inputSchema: ObserveInputSchema,
  annotations: {
    readOnlyHint: true,
  },
};

async function handleObserve(
  context: Context,
  params: ObserveInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();

      const observations = await stagehand.observe(params.instruction);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, data: observations }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to observe: ${errorMsg}`);
    }
  };

  return {
    action,
    waitForNetwork: false,
  };
}

const observeTool: Tool<typeof ObserveInputSchema> = {
  capability: "core",
  schema: observeSchema,
  handle: handleObserve,
};

export default observeTool;
