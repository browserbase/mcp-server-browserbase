import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema, 
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
  ListResourcesRequestSchema as ListResourcesOfTypeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Stagehand } from "@browserbasehq/stagehand";
import type { ConstructorParams } from "@browserbasehq/stagehand";

import { sanitizeMessage } from "./utils.js";
import { log, logRequest, logResponse, operationLogs, setServerInstance } from "./logging.js";
import { TOOLS, handleToolCall } from "./tools.js";
import { PROMPTS, getPrompt } from "./prompts.js";
import { 
  listResources, 
  listResourceTemplates, 
  getResource, 
  listResourcesOfType 
} from "./resources.js";

// Define Stagehand configuration
export const stagehandConfig: ConstructorParams = {
  env:
    process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID
      ? "BROWSERBASE"
      : "LOCAL",
  apiKey: process.env.BROWSERBASE_API_KEY /* API key for authentication */,
  projectId: process.env.BROWSERBASE_PROJECT_ID /* Project identifier */,
  debugDom: false /* Enable DOM debugging features */,
  headless: false /* Run browser in headless mode */,
  logger: (message) =>
    console.error(logLineToString(message)) /* Custom logging function to stderr */,
  domSettleTimeoutMs: 30_000 /* Timeout for DOM to settle in milliseconds */,
  browserbaseSessionCreateParams: {
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  },
  enableCaching: true /* Enable caching functionality */,
  browserbaseSessionID:
    undefined /* Session ID for resuming Browserbase sessions */,
  modelName: "gpt-4o" /* Name of the model to use */,
  modelClientOptions: {
    apiKey: process.env.OPENAI_API_KEY,
  } /* Configuration options for the model client */,
  useAPI: false,
};

// Global state
let stagehand: Stagehand | undefined;

// Ensure Stagehand is initialized
export async function ensureStagehand() {
  if (!stagehand) {
    stagehand = new Stagehand(stagehandConfig);
    await stagehand.init();
  }
  return stagehand;
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
        resources: {
          enabled: true
        },
        tools: {},
        logging: {},
        prompts: {}
      },
    }
  );

  // Store server instance for logging
  setServerInstance(server);

  // Setup request handlers
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    try {
      logRequest('ListTools', request.params);
      const response = { tools: TOOLS };
      const sanitizedResponse = sanitizeMessage(response);
      logResponse('ListTools', JSON.parse(sanitizedResponse));
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
      logRequest('CallTool', request.params);
      operationLogs.length = 0; // Clear logs for new operation
      
      if (!request.params?.name || !TOOLS.find(t => t.name === request.params.name)) {
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
              text: `Failed to initialize Stagehand: ${errorMsg}`,
            },
            {
              type: "text",
              text: `Operation logs:\n${formatLogResponse(operationLogs)}`,
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
      logResponse('CallTool', JSON.parse(sanitizedResult));
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
      logRequest('ListResources', request.params);
      // Return an empty list since we don't have any resources defined
      const response = listResources();
      const sanitizedResponse = sanitizeMessage(response);
      logResponse('ListResources', JSON.parse(sanitizedResponse));
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

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) => {
    try {
      logRequest('ListResourceTemplates', request.params);
      // Return an empty list since we don't have any resource templates defined
      const response = listResourceTemplates();
      const sanitizedResponse = sanitizeMessage(response);
      logResponse('ListResourceTemplates', JSON.parse(sanitizedResponse));
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
      logRequest('ListPrompts', request.params);
      const response = { prompts: PROMPTS };
      const sanitizedResponse = sanitizeMessage(response);
      logResponse('ListPrompts', JSON.parse(sanitizedResponse));
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
      logRequest('GetPrompt', request.params);
      
      // Check if prompt name is valid and get the prompt
      try {
        const prompt = getPrompt(request.params?.name || "");
        const sanitizedResponse = sanitizeMessage(prompt);
        logResponse('GetPrompt', JSON.parse(sanitizedResponse));
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

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      logRequest('GetResource', request.params);
      const resource = getResource(request.params?.id as string || "");
      const sanitizedResponse = sanitizeMessage(resource);
      logResponse('GetResource', JSON.parse(sanitizedResponse));
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

  server.setRequestHandler(ListResourcesOfTypeRequestSchema, async (request) => {
    try {
      logRequest('ListResourcesOfType', request.params);
      const resources = listResourcesOfType(request.params?.type as string || "");
      const sanitizedResponse = sanitizeMessage(resources);
      logResponse('ListResourcesOfType', JSON.parse(sanitizedResponse));
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

  return server;
}

// Import missing function from logging
import { formatLogResponse, logLineToString } from "./logging.js"; 