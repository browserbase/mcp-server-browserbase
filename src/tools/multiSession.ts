import { z } from "zod";
import { Browserbase } from "@browserbasehq/sdk";
import {
  defineTool,
  type Tool,
  type ToolResult,
  type InputType,
} from "./tool.js";
import * as stagehandStore from "../stagehandStore.js";
import { CreateSessionParams } from "../types/types.js";
import type { Context } from "../context.js";
import navigateTool from "./navigate.js";
import actTool from "./act.js";
import extractTool from "./extract.js";
import observeTool from "./observe.js";
import getUrlTool, { getAllUrlsTool } from "./url.js";

/**
 * Creates a session-aware version of an existing tool
 * This wraps the original tool's handler to work with a specific session
 */
function createMultiSessionAwareTool<TInput extends InputType>(
  originalTool: Tool<TInput>,
  options: {
    namePrefix?: string;
    nameSuffix?: string;
  } = {},
): Tool<InputType> {
  const { namePrefix = "", nameSuffix = "_session" } = options;

  // Create new input schema that includes sessionId
  const originalSchema = originalTool.schema.inputSchema;
  let newInputSchema: z.ZodSchema;

  if (originalSchema instanceof z.ZodObject) {
    // If it's a ZodObject, we can spread its shape
    newInputSchema = z.object({
      sessionId: z.string().describe("The session ID to use"),
      ...originalSchema.shape,
    });
  } else {
    // For other schema types, create an intersection
    newInputSchema = z.intersection(
      z.object({ sessionId: z.string().describe("The session ID to use") }),
      originalSchema,
    );
  }

  return defineTool({
    capability: originalTool.capability,
    schema: {
      name: `${namePrefix}${originalTool.schema.name}${nameSuffix}`,
      description: `${originalTool.schema.description} (for a specific session)`,
      inputSchema: newInputSchema,
    },
    handle: async (
      context: Context,
      params: z.infer<typeof newInputSchema>,
    ): Promise<ToolResult> => {
      const { sessionId, ...originalParams } = params;

      // Get the session
      const session = stagehandStore.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Create a temporary context that points to the specific session
      const sessionContext = Object.create(context);
      sessionContext.currentSessionId =
        session.metadata?.bbSessionId || sessionId;
      sessionContext.getStagehand = async () => session.stagehand;
      sessionContext.getActivePage = async () => session.page;
      sessionContext.getActiveBrowser = async () => session.browser;

      // Call the original tool's handler with the session-specific context
      return originalTool.handle(sessionContext, originalParams);
    },
  });
}

// Create session tool
export const createSessionTool = defineTool({
  capability: "create_session",
  schema: {
    name: "multi_browserbase_stagehand_session_create",
    description:
      "Create parallel browser session for multi-session workflows. Use this when you need multiple browser instances running simultaneously: parallel data scraping, concurrent automation, A/B testing, multiple user accounts, cross-site operations, batch processing, or any task requiring more than one browser. Creates an isolated browser session with independent cookies, authentication, and state. Always pair with session-specific tools (those ending with '_session'). Perfect for scaling automation tasks that require multiple browsers working in parallel.",
    inputSchema: z.object({
      name: z
        .string()
        .optional()
        .describe(
          "Highly recommended: Descriptive name for tracking multiple sessions (e.g. 'amazon-scraper', 'user-login-flow', 'checkout-test-1'). Makes debugging and session management much easier!",
        ),
      browserbaseSessionID: z
        .string()
        .optional()
        .describe(
          "Resume an existing Browserbase session by providing its session ID. Use this to continue work in a previously created browser session that may have been paused or disconnected.",
        ),
    }),
  },
  handle: async (
    context: Context,
    { name, browserbaseSessionID },
  ): Promise<ToolResult> => {
    try {
      const params: CreateSessionParams = {
        browserbaseSessionID,
        meta: name ? { name } : undefined,
      };

      const session = await stagehandStore.create(context.config, params);

      const bbSessionId = session.metadata?.bbSessionId;
      if (!bbSessionId) {
        throw new Error("No Browserbase session ID available");
      }

      // Get the debug URL using Browserbase SDK
      const bb = new Browserbase({
        apiKey: context.config.browserbaseApiKey,
      });
      const debugUrl = (await bb.sessions.debug(bbSessionId))
        .debuggerFullscreenUrl;

      return {
        action: async () => ({
          content: [
            {
              type: "text",
              text: `Created session ${session.id}${name ? ` (${name})` : ""}\nBrowserbase session: ${bbSessionId}\nBrowserbase Live Session View URL: https://www.browserbase.com/sessions/${bbSessionId}\nBrowserbase Live Debugger URL: ${debugUrl}`,
            },
          ],
        }),
        waitForNetwork: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create browser session: ${errorMessage}. Please check your Browserbase credentials and try again.`,
      );
    }
  },
});

// List sessions tool
export const listSessionsTool = defineTool({
  capability: "list_sessions",
  schema: {
    name: "multi_browserbase_stagehand_session_list",
    description:
      "ONLY WORKS WITH MULTI-SESSION TOOLS! Track all parallel sessions: Critical tool for multi-session management! Shows all active browser sessions with their IDs, names, ages, and Browserbase session IDs. Use this frequently to monitor your parallel automation workflows, verify sessions are running, and get session IDs for session-specific tools. Essential for debugging and resource management in complex multi-browser scenarios.",
    inputSchema: z.object({}),
  },
  handle: async (): Promise<ToolResult> => {
    const sessions = stagehandStore.list();

    if (sessions.length === 0) {
      return {
        action: async () => ({
          content: [
            {
              type: "text",
              text: "No active sessions",
            },
          ],
        }),
        waitForNetwork: false,
      };
    }

    const sessionInfo = sessions.map((s) => ({
      id: s.id,
      name: s.metadata?.name,
      browserbaseSessionId: s.metadata?.bbSessionId,
      created: new Date(s.created).toISOString(),
      age: Math.floor((Date.now() - s.created) / 1000),
    }));

    return {
      action: async () => ({
        content: [
          {
            type: "text",
            text: `Active sessions (${sessions.length}):\n${sessionInfo
              .map(
                (s) =>
                  `- ${s.id}${s.name ? ` (${s.name})` : ""} - BB: ${s.browserbaseSessionId} - Age: ${s.age}s`,
              )
              .join("\n")}`,
          },
        ],
      }),
      waitForNetwork: false,
    };
  },
});

// Close session tool
export const closeSessionTool = defineTool({
  capability: "close_session",
  schema: {
    name: "multi_browserbase_stagehand_session_close",
    description:
      "Cleanup parallel session for multi-session workflows. Properly terminates a browser session, ends the Browserbase session, and frees cloud resources. Always use this when finished with a session to avoid resource waste and billing charges. Critical for responsible multi-session automation - each unclosed session continues consuming resources!",
    inputSchema: z.object({
      sessionId: z
        .string()
        .describe(
          "Exact session ID to close (get from 'multi_browserbase_stagehand_session_list'). Double-check this ID - once closed, the session cannot be recovered!",
        ),
    }),
  },
  handle: async (_context: Context, { sessionId }): Promise<ToolResult> => {
    const session = stagehandStore.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await stagehandStore.remove(sessionId);

    return {
      action: async () => ({
        content: [
          {
            type: "text",
            text: `Closed session ${sessionId}`,
          },
        ],
      }),
      waitForNetwork: false,
    };
  },
});

// Create multi-session-aware versions of the core tools
export const navigateWithSessionTool = createMultiSessionAwareTool(
  navigateTool,
  {
    namePrefix: "multi_",
    nameSuffix: "_session",
  },
);

export const actWithSessionTool = createMultiSessionAwareTool(actTool, {
  namePrefix: "multi_",
  nameSuffix: "_session",
});

export const extractWithSessionTool = createMultiSessionAwareTool(extractTool, {
  namePrefix: "multi_",
  nameSuffix: "_session",
});

export const observeWithSessionTool = createMultiSessionAwareTool(observeTool, {
  namePrefix: "multi_",
  nameSuffix: "_session",
});

export const getUrlWithSessionTool = createMultiSessionAwareTool(getUrlTool, {
  namePrefix: "multi_",
  nameSuffix: "_session",
});

// This wraps getAllUrlsTool which doesn't need sessionId
export const getAllUrlsWithSessionTool = getAllUrlsTool;
