import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const ObserveInputSchema = z.object({
  instruction: z
    .string()
    .describe(
      "Detailed instruction for what specific elements or components to observe on the web page. " +
        "This instruction must be extremely specific and descriptive. For example: 'Find the red login button " +
        "in the top right corner', 'Locate the search input field with placeholder text', or 'Identify all " +
        "clickable product cards on the page'. The more specific and detailed your instruction, the better " +
        "the observation results will be. Avoid generic instructions like 'find buttons' or 'see elements'. " +
        "Instead, describe the visual characteristics, location, text content, or functionality of the elements " +
        "you want to observe. This tool is designed to help you identify interactive elements that you can " +
        "later use with the act tool for performing actions like clicking, typing, or form submission.",
    ),
  returnAction: z
    .boolean()
    .optional()
    .describe(
      "Whether to return the action to perform on the element. If true, the action will be returned as a string. " +
        "If false, the action will not be returned.",
    ),
});

type ObserveInput = z.infer<typeof ObserveInputSchema>;

const observeSchema: ToolSchema<typeof ObserveInputSchema> = {
  name: "browserbase_stagehand_observe",
  description:
    "Observes and identifies specific interactive elements on the current web page that can be used for subsequent actions. " +
    "This tool is specifically designed for finding actionable (interactable) elements such as buttons, links, form fields, " +
    "dropdowns, checkboxes, and other UI components that you can interact with. Use this tool when you need to locate " +
    "elements before performing actions with the act tool. DO NOT use this tool for extracting text content or data - " +
    "use the extract tool instead for that purpose. The observe tool returns detailed information about the identified " +
    "elements including their properties, location, and interaction capabilities. This information can then be used " +
    "to craft precise actions. The more specific your observation instruction, the more accurate the element identification " +
    "will be. Think of this as your 'eyes' on the page to find exactly what you need to interact with.",
  inputSchema: ObserveInputSchema,
};

async function handleObserve(
  context: Context,
  params: ObserveInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();

      const observations = await stagehand.page.observe({
        instruction: params.instruction,
        returnAction: params.returnAction,
      });

      return {
        content: [
          {
            type: "text",
            text: `Observations: ${JSON.stringify(observations)}`,
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
