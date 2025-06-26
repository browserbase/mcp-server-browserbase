import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Stagehand } from "@browserbasehq/stagehand";
import type { ConstructorParams } from "@browserbasehq/stagehand";

import { sanitizeMessage } from "./utils.js";
import {
  log,
  logRequest,
  logResponse,
  operationLogs,
  setServerInstance,
} from "./logging.js";
import { TOOLS, handleToolCall } from "./tools.js";
import { PROMPTS, getPrompt } from "./prompts.js";
import {
  listResources,
  listResourceTemplates,
  readResource,
} from "./resources.js";

// Define Stagehand configuration
export const stagehandConfig: ConstructorParams = {
  env:
    process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID
      ? "BROWSERBASE"
      : "LOCAL",
  apiKey: process.env.BROWSERBASE_API_KEY /* API key for authentication */,
  projectId: process.env.BROWSERBASE_PROJECT_ID /* Project identifier */,
  logger: (message) =>
    console.error(
      logLineToString(message)
    ) /* Custom logging function to stderr */,
  domSettleTimeoutMs: 30_000 /* Timeout for DOM to settle in milliseconds */,
  browserbaseSessionCreateParams:
    process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID
      ? {
          projectId: process.env.BROWSERBASE_PROJECT_ID!,
          browserSettings: process.env.CONTEXT_ID
            ? {
                context: {
                  id: process.env.CONTEXT_ID,
                  persist: true,
                },
              }
            : undefined,
        }
      : undefined,
  // Set a default CDP URL if running in LOCAL mode
  localBrowserLaunchOptions: process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID
    ? undefined
    : {
        cdpUrl: process.env.LOCAL_CDP_URL || "http://localhost:9222",
      },
  enableCaching: true /* Enable caching functionality */,
  browserbaseSessionID:
    undefined /* Session ID for resuming Browserbase sessions */,
  modelName: "gpt-4o" /* Name of the model to use */,
  modelClientOptions: {
    apiKey: process.env.OPENAI_API_KEY || "dummy-api-key-for-browserbase",
  } /* Configuration options for the model client */,
  useAPI: false,
};

// Global state
let stagehand: Stagehand | undefined;

// Ensure Stagehand is initialized
export async function ensureStagehand() {
  // We've added a default CDP URL in the config, so this check should always pass
  if (
    stagehandConfig.env === "LOCAL" &&
    !stagehandConfig.localBrowserLaunchOptions?.cdpUrl
  ) {
    log("No CDP URL provided, using http://localhost:9222 as fallback", "info");
    stagehandConfig.localBrowserLaunchOptions = {
      cdpUrl: "http://localhost:9222"
    };
  }

  try {
    // If stagehand doesn't exist, create a new instance
    if (!stagehand) {
      log("Creating new Stagehand instance", "info");
      stagehand = new Stagehand(stagehandConfig);
      try {
        await stagehand.init();
        log("Successfully initialized new Stagehand instance", "info");
        return stagehand;
      } catch (initError) {
        const initErrorMsg = initError instanceof Error ? initError.message : String(initError);
        log(`Failed to initialize new Stagehand instance: ${initErrorMsg}`, "error");
        throw initError;
      }
    }

    // If stagehand exists but page is not initialized
    if (!stagehand.page) {
      log("Stagehand exists but page is not initialized, reinitializing...", "info");
      try {
        await stagehand.init();
        log("Successfully reinitialized Stagehand page", "info");
        return stagehand;
      } catch (initError) {
        const initErrorMsg = initError instanceof Error ? initError.message : String(initError);
        log(`Failed to reinitialize Stagehand page: ${initErrorMsg}`, "error");
        // Create a new instance as fallback
        stagehand = new Stagehand(stagehandConfig);
        await stagehand.init();
        return stagehand;
      }
    }

    // Try to perform a simple operation to check if the session is still valid
    try {
      await stagehand.page.evaluate(() => document.title);
      return stagehand;
    } catch (error) {
      // If we get an error indicating the session is invalid, reinitialize
      if (
        error instanceof Error &&
        (error.message.includes(
          "Target page, context or browser has been closed"
        ) ||
          error.message.includes("Session expired") ||
          error.message.includes("context destroyed"))
      ) {
        log("Browser session expired, reinitializing Stagehand...", "info");
        stagehand = new Stagehand(stagehandConfig);
        await stagehand.init();
        return stagehand;
      }
      throw error; // Re-throw if it's a different type of error
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Failed to initialize/reinitialize Stagehand: ${errorMsg}`, "error");
    throw error;
  }
}

// Create the server
export function createServer() {
  const server = new Server(
    {
      name: "stagehand",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        logging: {},
        prompts: {},
      },
    }
  );

  // Store server instance for logging
  setServerInstance(server);

  // Setup request handlers
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    try {
      logRequest("ListTools", request.params);
      const response = { tools: TOOLS };
      const sanitizedResponse = sanitizeMessage(response);
      logResponse("ListTools", JSON.parse(sanitizedResponse));
      return JSON.parse(sanitizedResponse);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        error: {
          code: -32603,
          message: `Internal error: ${errorMsg}`,
        },
      };
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      logRequest("CallTool", request.params);
      operationLogs.length = 0; // Clear logs for new operation

      if (
        !request.params?.name ||
        !TOOLS.find((t) => t.name === request.params.name)
      ) {
        throw new Error(`Invalid tool name: ${request.params?.name}`);
      }

      // Ensure Stagehand is initialized
      try {
        stagehand = await ensureStagehand();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to initialize Stagehand: ${errorMsg}.\n\nConfig: ${JSON.stringify(
                stagehandConfig,
                null,
                2
              )}`,
            },
            {
              type: "text",
              text: `Operation logs:\n${operationLogs.join("\n")}`,
            },
          ],
          isError: true,
        };
      }

      const result = await handleToolCall(
        request.params.name,
        request.params.arguments ?? {},
        stagehand
      );

      const sanitizedResult = sanitizeMessage(result);
      logResponse("CallTool", JSON.parse(sanitizedResult));
      return JSON.parse(sanitizedResult);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        error: {
          code: -32603,
          message: `Internal error: ${errorMsg}`,
        },
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    try {
      logRequest("ListResources", request.params);
      const response = listResources();
      const sanitizedResponse = sanitizeMessage(response);
      logResponse("ListResources", JSON.parse(sanitizedResponse));
      return JSON.parse(sanitizedResponse);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        error: {
          code: -32603,
          message: `Internal error: ${errorMsg}`,
        },
      };
    }
  });

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (request) => {
      try {
        logRequest("ListResourceTemplates", request.params);
        const response = listResourceTemplates();
        const sanitizedResponse = sanitizeMessage(response);
        logResponse("ListResourceTemplates", JSON.parse(sanitizedResponse));
        return JSON.parse(sanitizedResponse);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          error: {
            code: -32603,
            message: `Internal error: ${errorMsg}`,
          },
        };
      }
    }
  );

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      logRequest("ReadResource", request.params);
      const uri = request.params.uri.toString();
      const response = readResource(uri);
      const sanitizedResponse = sanitizeMessage(response);
      logResponse("ReadResource", JSON.parse(sanitizedResponse));
      return JSON.parse(sanitizedResponse);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        error: {
          code: -32603,
          message: `Internal error: ${errorMsg}`,
        },
      };
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    try {
      logRequest("ListPrompts", request.params);
      const response = { prompts: PROMPTS };
      const sanitizedResponse = sanitizeMessage(response);
      logResponse("ListPrompts", JSON.parse(sanitizedResponse));
      return JSON.parse(sanitizedResponse);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        error: {
          code: -32603,
          message: `Internal error: ${errorMsg}`,
        },
      };
    }
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    try {
      logRequest("GetPrompt", request.params);

      // Check if prompt name is valid and get the prompt
      try {
        const prompt = getPrompt(request.params?.name || "");
        const sanitizedResponse = sanitizeMessage(prompt);
        logResponse("GetPrompt", JSON.parse(sanitizedResponse));
        return JSON.parse(sanitizedResponse);
      } catch (error) {
        throw new Error(`Invalid prompt name: ${request.params?.name}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        error: {
          code: -32603,
          message: `Internal error: ${errorMsg}`,
        },
      };
    }
  });

  return server;
}

// Import missing function from logging
import { formatLogResponse, logLineToString } from "./logging.js";
