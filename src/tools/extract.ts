import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

/**
 * Stagehand Extract
 * Docs: https://docs.stagehand.dev/basics/extract
 *
 * This tool is used to extract structured information and text content from a web page.
 *
 * We currently don't support the client providing a zod schema for the extraction.
 */

const ExtractInputSchema = z.object({
  instruction: z.string().describe(
    `The specific instruction for what information to extract from the current page.
    Be as detailed and specific as possible about what you want to extract. For example:
    'Extract all product names and prices from the listing page'.The more specific your instruction,
    the better the extraction results will be.`,
  ),
});

type ExtractInput = z.infer<typeof ExtractInputSchema>;

const extractSchema: ToolSchema<typeof ExtractInputSchema> = {
  name: "browserbase_stagehand_extract",
  description: `Extract structured data or text from the current page using an instruction.`,
  inputSchema: ExtractInputSchema,
};

async function handleExtract(
  context: Context,
  params: ExtractInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();

      const extraction = await stagehand.extract(params.instruction);

      return {
        content: [
          {
            type: "text",
            text: `Extracted content:\n${JSON.stringify(extraction, null, 2)}`,
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
