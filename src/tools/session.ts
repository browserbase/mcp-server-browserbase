import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";
import { Browserbase } from "@browserbasehq/sdk";
import { store } from "./helpers/session.js";

// --- Tool: Create Session ---
const CreateSessionInputSchema = z.object({
  // Keep sessionId optional, but clarify its role
  sessionId: z
    .string()
    .optional()
    .describe(
      "Optional session ID to use/reuse. If not provided or invalid, a new session is created.",
    ),
});
type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

const createSessionSchema: ToolSchema<typeof CreateSessionInputSchema> = {
  name: "browserbase_session_create",
  description:
    "Create or reuse a single cloud browser session using Browserbase with fully initialized Stagehand. WARNING: This tool is for SINGLE browser workflows only. If you need multiple browser sessions running simultaneously (parallel scraping, A/B testing, multiple accounts), use 'multi_browserbase_stagehand_session_create' instead. This creates one browser session with all configuration flags (proxies, stealth, viewport, cookies, etc.) and initializes Stagehand to work with that session. Updates the active session.",
  inputSchema: CreateSessionInputSchema,
};

// Handle function for CreateSession using new session management
async function handleCreateSession(
  context: Context,
  params: CreateSessionInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const sessionStore = store(context.config);

      // Create session with optional resumption
      const session = await sessionStore.create({
        browserbaseSessionID: params.sessionId,
      });

      // Get debug URL
      const bb = new Browserbase({
        apiKey: context.config.browserbaseApiKey,
      });
      const bbSessionId = session.metadata?.bbSessionId;
      if (!bbSessionId) {
        throw new Error("No Browserbase session ID available");
      }

      const debugUrl = (await bb.sessions.debug(bbSessionId))
        .debuggerFullscreenUrl;

      return {
        content: [
          {
            type: "text",
            text: `Browserbase Live Session View URL: https://www.browserbase.com/sessions/${bbSessionId}\nBrowserbase Live Debugger URL: ${debugUrl}`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create Browserbase session: ${errorMessage}`);
    }
  };

  return {
    action: action,
    waitForNetwork: false,
  };
}

// Define tool using handle
const createSessionTool: Tool<typeof CreateSessionInputSchema> = {
  capability: "core", // Add capability
  schema: createSessionSchema,
  handle: handleCreateSession,
};

// --- Tool: Close Session ---
const CloseSessionInputSchema = z.object({});

const closeSessionSchema: ToolSchema<typeof CloseSessionInputSchema> = {
  name: "browserbase_session_close",
  description:
    "Closes the current Browserbase session by properly shutting down the Stagehand instance, which handles browser cleanup and terminates the session recording.",
  inputSchema: CloseSessionInputSchema,
};

async function handleCloseSession(context: Context): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const sessionStore = store(context.config);

      // Close all sessions (since this is for single session workflows)
      await sessionStore.removeAll();

      return {
        content: [
          {
            type: "text",
            text: "Browserbase session closed successfully.",
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to close Browserbase session: ${errorMessage}`);
    }
  };

  return {
    action: action,
    waitForNetwork: false,
  };
}

const closeSessionTool: Tool<typeof CloseSessionInputSchema> = {
  capability: "core",
  schema: closeSessionSchema,
  handle: handleCloseSession,
};

export default [createSessionTool, closeSessionTool];
