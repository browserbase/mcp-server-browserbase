import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const ActInputSchema = z.object({
  action: z
    .string()
    .describe(
      "The action to perform. Should be as atomic and specific as possible, " +
        "i.e. 'Click the sign in button' or 'Type 'hello' into the search input'. AVOID actions that are more than one " +
        "step, i.e. 'Order me pizza' or 'Send an email to Paul asking him to call me'. The instruction should be just as specific as possible, " +
        "and have a strong correlation to the text on the page. If unsure, use observe before using act.",
    ),
  variables: z
    .object({})
    .optional()
    .describe(
      "Variables used in the action template. ONLY use variables if you're dealing " +
        "with sensitive data or dynamic content. For example, if you're logging in to a website, " +
        "you can use a variable for the password. When using variables, you MUST have the variable " +
        'key in the action template. For example: {"action": "Fill in the password", "variables": {"password": "123456"}}',
    ),
});

type ActInput = z.infer<typeof ActInputSchema>;

const actSchema: ToolSchema<typeof ActInputSchema> = {
  name: "browserbase_stagehand_act",
  description:
    "Performs an action on a web page element. Act actions should be as atomic and " +
    'specific as possible, i.e. "Click the sign in button" or "Type \'hello\' into the search input". ' +
    'AVOID actions that are more than one step, i.e. "Order me pizza" or "Send an email to Paul ' +
    'asking him to call me".',
  inputSchema: ActInputSchema,
};

async function handleAct(
  context: Context,
  params: ActInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand();

      await stagehand.page.act({
        action: params.action,
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
