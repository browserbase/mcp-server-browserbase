import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";
import { getUsageSnapshot, resetUsage } from "../mcp/usage.js";

const UsageInputSchema = z
  .object({
    sessionId: z
      .string()
      .optional()
      .describe(
        "Optional: filter per-session stats to a specific internal MCP session ID.",
      ),
    scope: z
      .enum(["global", "perSession", "all"])
      .optional()
      .describe(
        'Optional: which portion of the snapshot to return: "global", "perSession", or "all" (default).',
      ),
    reset: z
      .boolean()
      .optional()
      .describe(
        "Optional: when true, reset accumulated usage counters after returning the snapshot.",
      ),
  })
  .optional()
  .default({});

type UsageInput = z.infer<typeof UsageInputSchema>;

const usageSchema: ToolSchema<typeof UsageInputSchema> = {
  name: "browserbase_usage_stats",
  description:
    "Return a snapshot of Stagehand usage metrics (call counts) for this MCP process, optionally filtered by session.",
  inputSchema: UsageInputSchema,
};

async function handleUsage(
   
  context: Context,
  params: UsageInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    const snapshot = getUsageSnapshot();

    const scope = params.scope ?? "all";
    let result: unknown = snapshot;

    if (scope === "global") {
      result = { global: snapshot.global };
    } else if (scope === "perSession") {
      if (params.sessionId) {
        result = {
          perSession: {
            [params.sessionId]: snapshot.perSession[params.sessionId] ?? {
              operations: {},
            },
          },
        };
      } else {
        result = { perSession: snapshot.perSession };
      }
    } else if (scope === "all" && params.sessionId) {
      result = {
        global: snapshot.global,
        perSession: {
          [params.sessionId]: snapshot.perSession[params.sessionId] ?? {
            operations: {},
          },
        },
      };
    }

    if (params.reset) {
      resetUsage();
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  };

  return {
    action,
    waitForNetwork: false,
  };
}

const usageTool: Tool<typeof UsageInputSchema> = {
  capability: "core",
  schema: usageSchema,
  handle: handleUsage,
};

export default usageTool;
