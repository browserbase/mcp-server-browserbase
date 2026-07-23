import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";

const ConsoleLogsInputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  types: z.array(z.string().min(1)).optional(),
  clear: z.boolean().optional(),
});

type ConsoleLogsInput = z.infer<typeof ConsoleLogsInputSchema>;

const consoleLogsSchema: ToolSchema<typeof ConsoleLogsInputSchema> = {
  name: "console_logs",
  description:
    "Read recent browser console messages and page errors from the active session",
  inputSchema: ConsoleLogsInputSchema,
};

async function handleConsoleLogs(
  context: Context,
  params: ConsoleLogsInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    const session = await context
      .getSessionManager()
      .getSession(context.currentSessionId, context.config, false);

    if (!session) {
      throw new Error("No active Browserbase session. Call start first.");
    }

    const logs = session.consoleTelemetry?.list({
      limit: params.limit,
      types: params.types,
    });

    if (params.clear) {
      session.consoleTelemetry?.clear();
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            data: {
              sessionId: session.sessionId,
              count: logs?.length ?? 0,
              logs: logs ?? [],
              cleared: params.clear ?? false,
            },
          }),
        },
      ],
    };
  };

  return {
    action,
    waitForNetwork: false,
  };
}

const consoleLogsTool: Tool<typeof ConsoleLogsInputSchema> = {
  capability: "core",
  schema: consoleLogsSchema,
  handle: handleConsoleLogs,
};

export default consoleLogsTool;
