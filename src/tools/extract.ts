import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const ExtractInputSchema = z.object({
  instruction: z
    .string()
    .describe(
      "The specific instruction for what information to extract from the current page. " +
        "Be as detailed and specific as possible about what you want to extract. For example: " +
        "'Extract all product names and prices from the listing page' or 'Get the article title, " +
        "author, and publication date from this blog post'. The more specific your instruction, " +
        "the better the extraction results will be. Avoid vague instructions like 'get everything' " +
        "or 'extract the data'. Instead, be explicit about the exact elements, text, or information you need.",
    ),
});

type ExtractInput = z.infer<typeof ExtractInputSchema>;

const extractSchema: ToolSchema<typeof ExtractInputSchema> = {
  name: "browserbase_stagehand_extract",
  description:
    "Extracts structured information and text content from the current web page based on specific instructions " +
    "and a defined schema. This tool is ideal for scraping data, gathering information, or pulling specific " +
    "content from web pages. Use this tool when you need to get text content, data, or information from a page " +
    "rather than interacting with elements. For interactive elements like buttons, forms, or clickable items, " +
    "use the observe tool instead. The extraction works best when you provide clear, specific instructions " +
    "about what to extract and a well-defined JSON schema for the expected output format. This ensures " +
    "the extracted data is properly structured and usable.",
  inputSchema: ExtractInputSchema,
};

async function handleExtract(
  context: Context,
  params: ExtractInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();

      const extraction = await stagehand.page.extract(params.instruction);

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
