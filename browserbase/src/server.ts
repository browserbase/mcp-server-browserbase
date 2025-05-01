import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  closeAllSessions,
} from "./sessionManager.js";
// import { ALL_TOOL_SCHEMAS } from "./tools/definitions.js"; // Not needed if tools passed in
import type { Tool, ToolContext } from "./tools/tool.js"; // Tool needed for type hints
import { Context } from "./context.js";
import type { Config } from "./config.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from 'zod'; // Import z

// Remove direct tool imports
// import { navigateTool } from "./tools/navigate.js";
// ... etc ...

// Server factory options type
type BrowserbaseServerOptions = {
  name: string;
  version: string;
  tools: Tool<any>[]; // Expect the caller to provide the list of tools
};

// Factory function like the Playwright example
export function createServer(serverOptions: BrowserbaseServerOptions, config: Config): Server {
  const { name, version, tools } = serverOptions;
  
  // Build the tool map from the provided tools array
  const availableTools = new Map<string, Tool<any>>();
  for (const tool of tools) {
    availableTools.set(tool.schema.name, tool);
  }
  
  const server = new Server(
    { name, version },
    {
      capabilities: {
        resources: { list: true, read: true },
        tools: { list: true, call: true },
        notifications: { resources: { list_changed: true } },
      },
    }
  );

  // Create the context, passing server instance and config
  const context = new Context(server, config);

  // --- Setup Request Handlers ---

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: context.listResources() }; 
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const resourceContent = context.readResource(request.params.uri.toString());
      return { contents: [resourceContent] };
    } catch (error) {
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
    const errorResult = (...messages: string[]) => ({
      content: [{ type: 'text', text: messages.join('\n') }],
      isError: true,
    });

    // Use the map built from the passed-in tools
    const tool = availableTools.get(request.params.name);
    
    if (!tool) {
      console.error(`Tool "${request.params.name}" not found.`);
      // Check if it was a placeholder tool that wasn't implemented
      // This requires access to the original placeholder definitions, 
      // maybe pass placeholder names/schemas separately or handle in Context?
      // For now, just return not found.
      return errorResult(`Tool "${request.params.name}" not found`);
    }

    try {
      // Delegate execution to the context
      return await context.run(tool, request.params.arguments ?? {});
    } catch (error) {
      console.error(`Error running tool via context: ${error}`);
      return errorResult(`Failed to run tool '${request.params.name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Wrap server close to also close context
  const originalClose = server.close.bind(server);
  server.close = async () => {
    await context.close();
    await originalClose();
  };
  
  // Return the configured server instance, DO NOT connect here
  return server;
}
  // export async function runServer() {
//   try {
//     console.error("Initializing server transport...");
//     const transport = new StdioServerTransport();
//     const server = await createServer();
//     console.error("Connecting server...");
//     await server.connect(transport);
//     console.error("Browserbase MCP server connected via stdio and ready.");
//     // Optional pre-warming could be added here if needed,
//     // possibly by calling ensureBrowserSession from sessionManager
//   } catch (error) {
//     console.error(
//       `Failed to start or connect server: ${(error as Error).message}`,
//     );
//     process.exit(1); // Exit if server fails to start
//   }
  