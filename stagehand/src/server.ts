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
import OpenAI from 'openai';
import { CustomOpenAIClientWrapper } from "./customOpenAIClient.js";

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
// Read custom LLM environment variables
const customLlmApiKey = process.env.CUSTOM_LLM_API_KEY;
const customLlmBaseUrl = process.env.CUSTOM_LLM_BASE_URL;
const customLlmModelName = process.env.CUSTOM_LLM_MODEL_NAME;

// Read general LLM environment variables (for Gemini or default OpenAI)
const llmModel = process.env.LLM_MODEL; // Stagehand uses this for mapped providers like Gemini
const llmApiKey = process.env.LLM_API_KEY; // Stagehand uses this for mapped providers OR default OpenAI

export const stagehandConfig: ConstructorParams = (() => {
  const baseConfig: Partial<ConstructorParams> = {
    env:
      process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID
        ? "BROWSERBASE"
        : "LOCAL",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    logger: (message) => console.error(logLineToString(message)),
    domSettleTimeoutMs: 30_000,
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
    localBrowserLaunchOptions: process.env.LOCAL_CDP_URL
      ? { cdpUrl: process.env.LOCAL_CDP_URL }
      : undefined,
    enableCaching: true,
    browserbaseSessionID: undefined,
    useAPI: false,
  };

  // Priority 1: Custom OpenAI-compatible LLM
  if (customLlmBaseUrl && customLlmApiKey && customLlmModelName) {
    log(`Using Custom OpenAI-compatible LLM: ${customLlmModelName} at ${customLlmBaseUrl}`, "info");
    const customOpenAI = new OpenAI({
      apiKey: customLlmApiKey,
      baseURL: customLlmBaseUrl,
    });
    // Use the new constructor for CustomOpenAIClientWrapper
    const customLlmClient = new CustomOpenAIClientWrapper({ client: customOpenAI, modelName: customLlmModelName });
    return {
      ...baseConfig,
      llmClient: customLlmClient,
      modelName: customLlmModelName, // modelName is also part of CustomOpenAIClientWrapper but StagehandConfig might also expect it here
      // modelClientOptions should NOT be set here to avoid conflict
    } as ConstructorParams;
  }

  // Priority 2: Stagehand's mapped LLMs (e.g., Gemini via LLM_MODEL) or Default OpenAI
  let modelToUse = llmModel || "gpt-4o"; // Default to gpt-4o if LLM_MODEL is not set
  let clientOptions: { apiKey?: string } = {};

  if (llmModel) { // If LLM_MODEL is set (e.g., for Gemini)
    log(`Using mapped LLM: ${llmModel}`, "info");
    // Stagehand handles provider mapping internally based on modelName
    // If LLM_MODEL is something like "gemini/gemini-pro", Stagehand expects LLM_API_KEY for it.
    if (llmApiKey) {
      clientOptions.apiKey = llmApiKey;
    }
  } else if (llmApiKey) { // For default OpenAI (if LLM_MODEL is not set, but LLM_API_KEY is for OpenAI)
    log(`Using default OpenAI with provided API key. Model: ${modelToUse}`, "info");
    clientOptions.apiKey = llmApiKey;
  } else {
    log(`Using default OpenAI (gpt-4o) with API key from OPENAI_API_KEY env var if available. Model: ${modelToUse}`, "info");
    // Fallback to OPENAI_API_KEY if LLM_API_KEY is not set, for default OpenAI
    clientOptions.apiKey = process.env.OPENAI_API_KEY;
  }
  
  return {
    ...baseConfig,
    modelName: modelToUse, // Stagehand uses this for mapped LLMs or default OpenAI
    modelClientOptions: Object.keys(clientOptions).length > 0 ? clientOptions : undefined,
  } as ConstructorParams;
})();

// Global state
let stagehand: Stagehand | undefined;

// Ensure Stagehand is initialized
export async function ensureStagehand() {
  // Simplified condition: if local, CDP URL must be provided.
  // Stagehand itself will handle errors for missing Browserbase credentials if env is BROWSERBASE.
  if (stagehandConfig.env === "LOCAL" && !stagehandConfig.localBrowserLaunchOptions?.cdpUrl) {
    throw new Error(
      'Using a local browser without providing a CDP URL is not supported. Please provide a CDP URL using the LOCAL_CDP_URL environment variable.\n\nTo launch your browser in "debug", see our documentation.\n\nhttps://docs.stagehand.dev/examples/customize_browser#use-your-personal-browser'
    );
  }

  try {
    if (!stagehand) {
      stagehand = new Stagehand(stagehandConfig);
      await stagehand.init();
      return stagehand;
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
    // Add more context to the error if it's a configuration issue
    if (!stagehandConfig.llmClient && !stagehandConfig.modelClientOptions?.apiKey && !llmModel && !process.env.OPENAI_API_KEY && !customLlmApiKey) {
        log("LLM API key is missing. Please set CUSTOM_LLM_API_KEY (with base URL and model), LLM_API_KEY (for mapped models or default OpenAI), or OPENAI_API_KEY (for default OpenAI).", "info"); // Changed "warn" to "info"
    }
    throw error;
  }
}

// Create the server
export function createServer() {
  const server = new Server(
    {
      name: "stagehand",
      version: "0.1.0", // Consider updating this version if making significant changes
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

  // Log the effective Stagehand configuration being used (excluding sensitive keys)
  const { apiKey, projectId, modelClientOptions, ...safeConfig } = stagehandConfig;
  const displayConfig = {
      ...safeConfig,
      env: stagehandConfig.env, // ensure env is shown
      modelName: stagehandConfig.modelName, // ensure modelName is shown
      llmClientUsed: !!stagehandConfig.llmClient,
      modelClientOptionsSet: !!modelClientOptions?.apiKey, // Log if API key was configured for default client
      browserbaseConfig: (apiKey && projectId) ? { projectId } : "Not configured", // Avoid logging actual BB API key
  };
  log(`Effective Stagehand Configuration: ${JSON.stringify(displayConfig, null, 2)}`, "info");
  
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
