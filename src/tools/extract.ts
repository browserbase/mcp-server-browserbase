import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const ExtractInputSchema = z.object({
  instruction: z.string().optional(),
});

type ExtractInput = z.infer<typeof ExtractInputSchema>;

const extractSchema: ToolSchema<typeof ExtractInputSchema> = {
  name: "extract",
  description: "Extract data from the page",
  inputSchema: ExtractInputSchema,
  annotations: {
    readOnlyHint: true,
  },
};

async function handleExtract(
  context: Context,
  params: ExtractInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();

      const extraction = params.instruction
        ? await stagehand.extract(params.instruction)
        : await stagehand.extract({});

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, data: extraction }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to extract content: ${errorMsg}`);
    }
  };

  return {
    action,
    waitForNetwork: false,
  };
}

const extractTool: Tool<typeof ExtractInputSchema> = {
  capability: "core",
  schema: extractSchema,
  handle: handleExtract,
};

export default extractTool;
