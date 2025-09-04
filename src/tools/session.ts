import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../types/types.js";
import { Browserbase } from "@browserbasehq/sdk";
import { createUIResource } from "@mcp-ui/server";

// Import SessionManager functions
import {
  createNewBrowserSession,
  defaultSessionId,
  ensureDefaultSessionInternal,
  cleanupSession,
  getSession,
} from "../sessionManager.js";
import type { BrowserSession } from "../types/types.js";
import { TextContent } from "@modelcontextprotocol/sdk/types.js";

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

// Handle function for CreateSession using SessionManager
async function handleCreateSession(
  context: Context,
  params: CreateSessionInput,
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const config = context.config; // Get config from context
      let targetSessionId: string;

      if (params.sessionId) {
        const projectId = config.browserbaseProjectId || "";
        targetSessionId = `${params.sessionId}_${projectId}`;
        process.stderr.write(
          `[tool.createSession] Attempting to create/assign session with specified ID: ${targetSessionId}`,
        );
      } else {
        targetSessionId = defaultSessionId;
      }

      let session: BrowserSession;
      if (targetSessionId === defaultSessionId) {
        session = await ensureDefaultSessionInternal(config);
      } else {
        // When user provides a sessionId, we want to resume that Browserbase session
        session = await createNewBrowserSession(
          targetSessionId,
          config,
          params.sessionId,
        );
      }

      if (
        !session ||
        !session.browser ||
        !session.page ||
        !session.sessionId ||
        !session.stagehand
      ) {
        throw new Error(
          `SessionManager failed to return a valid session object with actualSessionId for ID: ${targetSessionId}`,
        );
      }

      context.currentSessionId = targetSessionId;
      const bb = new Browserbase({
        apiKey: config.browserbaseApiKey,
      });

      const browserbaseSessionId = session.stagehand.browserbaseSessionID;
      if (!browserbaseSessionId) {
        throw new Error(
          "Browserbase session ID not found in Stagehand instance",
        );
      }
      const debugUrl = (await bb.sessions.debug(browserbaseSessionId))
        .debuggerFullscreenUrl;
      process.stderr.write(
        `[tool.connected] Successfully connected to Browserbase session. Internal ID: ${targetSessionId}, Actual ID: ${browserbaseSessionId}`,
      );

      process.stderr.write(
        `[SessionManager] Browserbase Live Session View URL: https://www.browserbase.com/sessions/${browserbaseSessionId}`,
      );

      process.stderr.write(
        `[SessionManager] Browserbase Live Debugger URL: ${debugUrl}`,
      );

      return {
        content: [
          {
            type: "text",
            text: `Browserbase Live Session View URL: https://www.browserbase.com/sessions/${browserbaseSessionId}`,
          },
          {
            type: "text",
            text: `Browserbase Live Debugger URL: ${debugUrl}`,
          },
          createUIResource({
            uri: "ui://analytics-dashboard/main",
            content: { type: "externalUrl", iframeUrl: debugUrl },
            encoding: "text",
          }) as unknown as TextContent,
        ],
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[tool.createSession] Action failed: ${errorMessage}`,
      );
      // Re-throw to be caught by Context.run's error handling for actions
      throw new Error(`Failed to create Browserbase session: ${errorMessage}`);
    }
  };

  // Return the ToolResult structure expected by Context.run
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
    // Store the current session ID before it's potentially changed.
    const previousSessionId = context.currentSessionId;
    let stagehandClosedSuccessfully = false;
    let stagehandCloseErrorMessage = "";

    // Step 1: Attempt to get the session and close Stagehand
    let browserbaseSessionId: string | undefined;
    try {
      const session = await getSession(
        previousSessionId,
        context.config,
        false,
      );

      if (session && session.stagehand) {
        // Store the actual Browserbase session ID for the replay URL
        browserbaseSessionId = session.sessionId;

        process.stderr.write(
          `[tool.closeSession] Attempting to close Stagehand for session: ${previousSessionId || "default"} (Browserbase ID: ${browserbaseSessionId})`,
        );

        // Use Stagehand's close method which handles browser cleanup properly
        await session.stagehand.close();
        stagehandClosedSuccessfully = true;

        process.stderr.write(
          `[tool.closeSession] Stagehand and browser connection for session (${previousSessionId}) closed successfully.`,
        );

        // Clean up the session from tracking
        await cleanupSession(previousSessionId);

        if (browserbaseSessionId) {
          process.stderr.write(
            `[tool.closeSession] View session replay at https://www.browserbase.com/sessions/${browserbaseSessionId}`,
          );
        }
      } else {
        process.stderr.write(
          `[tool.closeSession] No Stagehand instance found for session: ${previousSessionId || "default/unknown"}`,
        );
      }
    } catch (error: unknown) {
      stagehandCloseErrorMessage =
        error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[tool.closeSession] Error retrieving or closing Stagehand (session ID was ${previousSessionId || "default/unknown"}): ${stagehandCloseErrorMessage}`,
      );
    }

    // Step 2: Always reset the context's current session ID to default
    const oldContextSessionId = context.currentSessionId;
    context.currentSessionId = defaultSessionId;
    process.stderr.write(
      `[tool.closeSession] Session context reset to default. Previous context session ID was ${oldContextSessionId || "default/unknown"}.`,
    );

    // Step 3: Determine the result message
    if (stagehandCloseErrorMessage && !stagehandClosedSuccessfully) {
      throw new Error(
        `Failed to close the Stagehand session (session ID in context was ${previousSessionId || "default/unknown"}). Error: ${stagehandCloseErrorMessage}. Session context has been reset to default.`,
      );
    }

    if (stagehandClosedSuccessfully) {
      let successMessage = `Browserbase session (${previousSessionId || "default"}) closed successfully via Stagehand. Context reset to default.`;
      if (browserbaseSessionId && previousSessionId !== defaultSessionId) {
        successMessage += ` View replay at https://www.browserbase.com/sessions/${browserbaseSessionId}`;
      }
      return { content: [{ type: "text", text: successMessage }] };
    }

    // No Stagehand instance was found
    let infoMessage =
      "No active Stagehand session found to close. Session context has been reset to default.";
    if (previousSessionId && previousSessionId !== defaultSessionId) {
      infoMessage = `No active Stagehand session found for session ID '${previousSessionId}'. The context has been reset to default.`;
    }
    return { content: [{ type: "text", text: infoMessage }] };
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
