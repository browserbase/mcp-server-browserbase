import * as dotenv from "dotenv";
dotenv.config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MCPToolsArray } from "./types/types.js";

import { Context } from "./context.js";
import type { Config } from "../config.d.ts";
import { TOOLS } from "./tools/index.js";
import { AvailableModelSchema } from "./types/models.js";
import { PROMPTS, getPrompt } from "./mcp/prompts.js";
import { RESOURCE_TEMPLATES } from "./mcp/resources.js";

import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
});

// Configuration schema for Smithery - matches existing Config interface
export const configSchema = z
  .object({
    browserbaseApiKey: z.string().describe("The Browserbase API Key to use"),
    browserbaseProjectId: z
      .string()
      .describe("The Browserbase Project ID to use"),
    proxies: z
      .boolean()
      .optional()
      .describe("Whether or not to use Browserbase proxies"),
    advancedStealth: z
      .boolean()
      .optional()
      .describe(
        "Use advanced stealth mode. Only available to Browserbase Scale Plan users",
      ),
    keepAlive: z
      .boolean()
      .optional()
      .describe("Whether or not to keep the Browserbase session alive"),
    context: z
      .object({
        contextId: z
          .string()
          .optional()
          .describe("The ID of the context to use"),
        persist: z
          .boolean()
          .optional()
          .describe("Whether or not to persist the context"),
      })
      .optional(),
    viewPort: z
      .object({
        browserWidth: z
          .number()
          .optional()
          .describe("The width of the browser"),
        browserHeight: z
          .number()
          .optional()
          .describe("The height of the browser"),
      })
      .optional(),
    cookies: z
      .array(cookieSchema)
      .optional()
      .describe("Cookies to inject into the Browserbase context"),
    server: z
      .object({
        port: z
          .number()
          .optional()
          .describe("The port to listen on for SHTTP or MCP transport"),
        host: z
          .string()
          .optional()
          .describe(
            "The host to bind the server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces",
          ),
      })
      .optional(),
    modelName: AvailableModelSchema.optional().describe(
      "The model to use for Stagehand (default: google/gemini-2.0-flash)",
    ), // Already an existing Zod Enum
    modelApiKey: z
      .string()
      .optional()
      .describe(
        "API key for the custom model provider. Required when using a model other than the default google/gemini-2.0-flash",
      ),
    experimental: z
      .boolean()
      .optional()
      .describe("Enable experimental Stagehand features"),
  })
  .refine(
    (data) => {
      // If a non-default model is explicitly specified, API key is required
      if (data.modelName && data.modelName !== "google/gemini-2.0-flash") {
        return data.modelApiKey !== undefined && data.modelApiKey.length > 0;
      }
      return true;
    },
    {
      message: "modelApiKey is required when specifying a custom model",
      path: ["modelApiKey"],
    },
  );

// Default function for Smithery
export default function ({ config }: { config: z.infer<typeof configSchema> }) {
  if (!config.browserbaseApiKey) {
    throw new Error("browserbaseApiKey is required");
  }
  if (!config.browserbaseProjectId) {
    throw new Error("browserbaseProjectId is required");
  }

  const server = new McpServer({
    name: "Browserbase MCP Server",
    version: "2.0.0",
    description:
      "Cloud browser automation server powered by Browserbase and Stagehand. Enables LLMs to navigate websites, interact with elements, extract data, and capture screenshots using natural language commands.",
    capabilities: {
      resources: {
        subscribe: true,
        listChanged: true,
      },
      prompts: {
        listChanged: true,
      },
      sampling: {},
    },
  });

  const internalConfig: Config = config as Config;

  // Create the context, passing server instance and config
  const context = new Context(server.server, internalConfig);

  server.server.registerCapabilities({
    resources: {
      subscribe: true,
      listChanged: true,
    },
    prompts: {
      listChanged: true,
    },
    sampling: {},
  });

  // Add resource handlers
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return context.listResources();
  });

  server.server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request) => {
      return context.readResource(request.params.uri);
    },
  );

  server.server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async () => {
      return { resourceTemplates: RESOURCE_TEMPLATES };
    },
  );

  // Add prompt handlers
  server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: PROMPTS };
  });

  server.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompt = getPrompt(request.params.name);
    return prompt;
  });

  const tools: MCPToolsArray = [...TOOLS];

  // Register each tool with the Smithery server
  tools.forEach((tool) => {
    if (tool.schema.inputSchema instanceof z.ZodObject) {
      server.tool(
        tool.schema.name,
        tool.schema.description,
        tool.schema.inputSchema.shape,
        async (params: z.infer<typeof tool.schema.inputSchema>) => {
          try {
            const result = await context.run(tool, params);
            return result;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            process.stderr.write(
              `[Smithery Error] ${new Date().toISOString()} Error running tool ${tool.schema.name}: ${errorMessage}\n`,
            );
            throw new Error(
              `Failed to run tool '${tool.schema.name}': ${errorMessage}`,
            );
          }
        },
      );
    } else {
      console.warn(
        `Tool "${tool.schema.name}" has an input schema that is not a ZodObject. Schema type: ${tool.schema.inputSchema.constructor.name}`,
      );
    }
  });

  return server.server;
}
