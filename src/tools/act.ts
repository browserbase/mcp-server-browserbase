import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const ActInputSchema = z.object({
  action: z.string().min(1),
  sessionId: z
    .string()
    .optional()
    .describe(
      "The Browserbase session ID to act on. Defaults to the active session. Pass the sessionId returned by start to target a specific session.",
    ),
});

type ActInput = z.infer<typeof ActInputSchema>;

const actSchema: ToolSchema<typeof ActInputSchema> = {
  name: "act",
  description: "Perform an action on the page",
  inputSchema: ActInputSchema,
};

async function handleAct(
  context: Context,
  params: ActInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const stagehand = await context.getStagehand(params.sessionId);

      const result = await stagehand.act(params.action);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, data: result }),
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
