import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js"; 
import type { Context } from "../context.js"; 
import type { ToolActionResult } from "../context.js"; 

// Import SessionManager functions
import {
  createNewBrowserSession,
  defaultSessionId,
  ensureDefaultSessionInternal,
  type BrowserSession,
} from "../sessionManager.js";

// --- Tool: Create Session ---
const CreateSessionInputSchema = z.object({
  // Keep sessionId optional, but clarify its role
  sessionId: z
    .string()
    .optional()
    .describe(
      "Optional session ID to use/reuse. If not provided or invalid, a new session is created."
    ),
});
type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

const createSessionSchema: ToolSchema<typeof CreateSessionInputSchema> = {
  name: "browserbase_session_create", 
  description:
    "Create or reuse a cloud browser session using Browserbase. Updates the active session.", 
  inputSchema: CreateSessionInputSchema,
};


// Handle function for CreateSession using SessionManager
async function handleCreateSession(
  context: Context,
  params: CreateSessionInput
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    try {
      const config = context.config; // Get config from context
      let targetSessionId: string;

      if (params.sessionId) {
        targetSessionId = params.sessionId;
        process.stderr.write(
          `[tool.createSession] Attempting to create/assign session with specified ID: ${targetSessionId}`
        );
      } else {
        targetSessionId = defaultSessionId;
      }

      let session: BrowserSession;
      if (targetSessionId === defaultSessionId) {
        session = await ensureDefaultSessionInternal(config);
      } else {
        session = await createNewBrowserSession(targetSessionId, config);
      }

      if (!session || !session.browser || !session.page || !session.sessionId) {
        throw new Error(
          `SessionManager failed to return a valid session object with actualSessionId for ID: ${targetSessionId}`
        );
      }

      context.currentSessionId = targetSessionId;
      process.stderr.write(
        `[tool.connected] Successfully connected to Browserbase session. Internal ID: ${targetSessionId}, Actual ID: ${session.sessionId}`
      );

      process.stderr.write(`[SessionManager] Browserbase Live Debugger URL: https://www.browserbase.com/sessions/${session.sessionId}`);

      return {
        content: [
          {
            type: "text",
            text: `https://www.browserbase.com/sessions/${session.sessionId}`,
          },
        ],
      };
    } catch (error: any) {
      process.stderr.write(
        `[tool.createSession] Action failed: ${
          error.message || String(error)
        }`
      );
      // Re-throw to be caught by Context.run's error handling for actions
      throw new Error(
        `Failed to create Browserbase session: ${
          error.message || String(error)
        }`
      );
    }
  };

  // Return the ToolResult structure expected by Context.run
  return {
    action: action, 
    captureSnapshot: false, 
    code: [],  
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
const CloseSessionInputSchema = z.object({
  random_string: z
    .string()
    .optional()
    .describe("Dummy parameter to ensure consistent tool call format."),
});
type CloseSessionInput = z.infer<typeof CloseSessionInputSchema>;

const closeSessionSchema: ToolSchema<typeof CloseSessionInputSchema> = {
  name: "browserbase_session_close",
  description:
    "Closes the current Browserbase session by disconnecting the Playwright browser. This will terminate the recording for the session.",
  inputSchema: CloseSessionInputSchema,
};

async function handleCloseSession(
  context: Context,
  _params: CloseSessionInput
): Promise<ToolResult> {
  const code = [`// Attempting to close the current Browserbase session.`];

  const action = async (): Promise<ToolActionResult> => {
    // Store the current session ID before it's potentially changed.
    // This allows us to reference the original session ID later if needed.
    const previousSessionId = context.currentSessionId; // Capture the ID before any changes
    let browser: BrowserSession["browser"] | null = null;
    let browserClosedSuccessfully = false;
    let browserCloseErrorMessage = "";

    // Step 1: Attempt to get the active browser instance
    try {
      // This call might be associated with 'previousSessionId' (which could be default or specific)
      browser = await context.getActiveBrowser();
    } catch (error: any) {
      process.stderr.write(
        `[tool.closeSession] Error retrieving active browser (session ID was ${previousSessionId || 'default/unknown'}): ${error.message || String(error)}`
      );
      // If we can't even get the browser, we can't close it.
      // We will still proceed to reset context.
    }

    // Step 2: If a browser instance was retrieved, attempt to close it
    if (browser) {
      try {
        process.stderr.write(
          `[tool.closeSession] Attempting to close browser for session: ${previousSessionId || 'default (actual might differ)'}`
        );
        await browser.close();
        browserClosedSuccessfully = true;
        process.stderr.write(
          `[tool.closeSession] Browser connection for session (was ${previousSessionId}) closed.`
        );

        process.stderr.write(
          `[tool.closeSession] View session replay at https://www.browserbase.com/sessions/${previousSessionId}`
        );
        
      } catch (error: any) {
        browserCloseErrorMessage = error.message || String(error);
        process.stderr.write(
          `[tool.closeSession] Error during browser.close() for session (was ${previousSessionId}): ${browserCloseErrorMessage}`
        );
      }
    } else {
      process.stderr.write(
        `[tool.closeSession] No active browser instance found to close. (Session ID in context was: ${previousSessionId || 'default/unknown'}).`
      );
    }

    // Step 3: Always reset the context's current session ID to default
    // and clear snapshot if the previous session was a specific one.
    const oldContextSessionId = context.currentSessionId; // This should effectively be 'previousSessionId'
    context.currentSessionId = defaultSessionId;
    if (oldContextSessionId && oldContextSessionId !== defaultSessionId) {
      context.clearLatestSnapshot();
      process.stderr.write(
        `[tool.closeSession] Snapshot cleared for previous session: ${oldContextSessionId}.`
      );
    }
    process.stderr.write(
      `[tool.closeSession] Session context reset to default. Previous context session ID was ${oldContextSessionId || 'default/unknown'}.`
    );

    // Step 4: Determine the result message
    if (browser && !browserClosedSuccessfully) { // An attempt was made to close, but it failed
      throw new Error(
        `Failed to close the Browserbase browser (session ID in context was ${previousSessionId || 'default/unknown'}). Error: ${browserCloseErrorMessage}. Session context has been reset to default.`
      );
    }

    if (browserClosedSuccessfully) { // Browser was present and closed
      let successMessage = `Browserbase session (associated with context ID ${previousSessionId || 'default'}) closed successfully. Context reset to default.`;
      if (previousSessionId && previousSessionId !== defaultSessionId) {
        successMessage += ` If this was a uniquely named session (${previousSessionId}), view replay (if available) at https://browserbase.com/sessions/${previousSessionId}`;
      }
      return { content: [{ type: "text", text: successMessage }] };
    }

    // No browser was found, or browser was null initially.
    let infoMessage = "No active browser instance was found to close. Session context has been reset to default.";
    if (previousSessionId && previousSessionId !== defaultSessionId) {
       // This means a specific session was in context, but no browser for it.
       infoMessage = `No active browser found for session ID '${previousSessionId}' in context. The context has been reset to default.`;
    }
    return { content: [{ type: "text", text: infoMessage }] };
  };

  return {
    action: action,
    code: code,
    captureSnapshot: false,
    waitForNetwork: false,
  };
}

const closeSessionTool: Tool<typeof CloseSessionInputSchema> = {
  capability: "core",
  schema: closeSessionSchema,
  handle: handleCloseSession,
};

export default [createSessionTool, closeSessionTool];