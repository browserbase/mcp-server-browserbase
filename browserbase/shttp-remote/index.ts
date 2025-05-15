import dotenv from "dotenv";
dotenv.config();

import { Config } from "../config";
import type { Tool } from "./tools/tool";

import navigate from "./tools/navigate";
import snapshot from "./tools/snapshot";
import keyboard from "./tools/keyboard";
import getText from "./tools/getText";
import session from "./tools/session";
import common from "./tools/common";
import contextTools from "./tools/context";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Context } from "./context";

export async function createServer(config: Config): Promise<Server> {
  // Create the server
  const server = new Server(
    { name: "mcp-server-browserbase", version: "1.0.5" },
    {
      capabilities: {
        resources: { list: true, read: true },
        tools: { list: true, call: true },
        prompts: { list: true, get: true },
        notifications: { resources: { list_changed: true } },
      },
    }
  ); 

  // Create the context, passing server instance and config
  const context = new Context(server, config);

  const tools: Tool<any>[] = [
    ...common,
    ...snapshot,
    ...keyboard,
    ...getText,
    ...navigate,
    ...session,
    ...contextTools,
  ];

  const toolsMap = new Map(tools.map(tool => [tool.schema.name, tool]));
   // --- Setup Request Handlers ---

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: context.listResources() }; 
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const resourceContent = context.readResource(request.params.uri.toString());
      return { contents: [resourceContent] };
    } catch (error) {
      // Keep this error log
      console.error(`Error reading resource via context: ${error}`);
      throw error;
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => {
        let finalInputSchema;
        // Check if inputSchema is a Zod schema before converting
        if (tool.schema.inputSchema instanceof z.Schema) {
          // Add type assertion to help compiler
          finalInputSchema = zodToJsonSchema(tool.schema.inputSchema as any);
        } else if (typeof tool.schema.inputSchema === 'object' && tool.schema.inputSchema !== null) {
          // Assume it's already a valid JSON schema object
          finalInputSchema = tool.schema.inputSchema;
        } else {
          // Fallback or error handling if schema is neither
          // Keep this error log
          console.error(`Warning: Tool '${tool.schema.name}' has an unexpected inputSchema type.`);
          finalInputSchema = { type: "object" }; // Default to empty object schema
        }
        
        return {
          name: tool.schema.name,
          description: tool.schema.description,
          inputSchema: finalInputSchema,
        };
      }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const logError = (message: string) => {
      // Ensure error logs definitely go to stderr
      process.stderr.write(`[server.ts Error] ${new Date().toISOString()} ${message}\\n`);
    };

    // Use the map built from the passed-in tools
    const tool = toolsMap.get(request.params.name);

    if (!tool) {
      // Use the explicit error logger
      logError(`Tool "${request.params.name}" not found.`);
      // Return a simplified error object
      return { content: [{ type: 'text', text: `Tool "${request.params.name}" not found` }], isError: true };
    }

    try {
      // Delegate execution to the context
      const result = await context.run(tool, request.params.arguments ?? {});
      return result;
    } catch (error) {
      // Use the explicit error logger
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Error running tool ${request.params.name} via context: ${errorMessage}`);
      logError(`Original error stack (if available): ${error instanceof Error ? error.stack : 'N/A'}`); // Log stack trace
      // Return a simplified error object
      return { content: [{ type: 'text', text: `Failed to run tool '${request.params.name}': ${errorMessage}` }], isError: true };
    }
  });

  // Wrap server close to also close context
  const originalClose = server.close.bind(server);
  server.close = async () => {
    await originalClose();
  };
  
  // Return the configured server instance
  return server;
} 