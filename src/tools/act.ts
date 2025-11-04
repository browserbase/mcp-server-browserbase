import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

/**
 * Stagehand Act
 * Docs: https://docs.stagehand.dev/basics/act
 *
 * This tool is used to perform actions on a web page.
 */

const ActInputSchema = z.object({
  action: z.string().describe(
    `The action to perform. Should be as atomic and specific as possible,
      i.e. 'Click the sign in button' or 'Type 'hello' into the search input'.`,
  ),
  variables: z
    .object({})
    .optional()
    .describe(
      `Variables used in the action template. ONLY use variables if you're dealing
      with sensitive data or dynamic content. When using variables, you MUST have the variable
      key in the action template. ie: {"action": "Fill in the password", "variables": {"password": "123456"}}`,
    ),
});

type ActInput = z.infer<typeof ActInputSchema>;

const actSchema: ToolSchema<typeof ActInputSchema> = {
  name: "browserbase_stagehand_act",
  description: `Perform a single action on the page (e.g., click, type).`,
  inputSchema: ActInputSchema,
};

async function handleAct(
  context: Context,
  params: ActInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();

      await stagehand.act(params.action, {
        variables: params.variables,
      });

      return {
        content: [
          {
            type: "text",
            text: `Action performed: ${params.action}`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to perform action: ${errorMsg}`);
    }
  };

  return {
    action,
    waitForNetwork: false,
  };
}

const actTool: Tool<typeof ActInputSchema> = {
  capability: "core",
  schema: actSchema,
  handle: handleAct,
};

export default actTool;
