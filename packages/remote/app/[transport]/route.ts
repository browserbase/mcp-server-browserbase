import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Tool, navigate, common, snapshot, keyboard, getText, session, contextTools, Context, defaultConfig, resolveConfig} from "@mcp/core";
import { withMcpAuth } from "@/lib/auth";

const contextMap = new Map<string, Context>();

const mcpServerFactory = (req: Request) => async (server: any) => {
  const tools: Tool<any>[] = [
    ...common,
    ...snapshot,
    ...keyboard,
    ...getText,
    ...navigate,
    ...session,
    ...contextTools,
  ];

  tools.forEach(tool => {
    if (tool.schema.inputSchema instanceof z.ZodObject) {
      server.tool(
        tool.schema.name,
        tool.schema.description,
        tool.schema.inputSchema.shape,
        async (params: z.infer<typeof tool.schema.inputSchema>) => {
          if (!req || typeof req.headers?.get !== 'function') {
            console.error("Tool execution: 'req' object not available or invalid. Headers cannot be accessed.", req);
            throw new Error("Internal server error: Request context is missing for tool execution.");
          }

          const browserbaseApiKey = req.headers.get("x-api-key");
          const browserbaseProjectId = req.headers.get("x-project-id");
          const contextId = req.headers.get("x-context-id");

          const requestConfig = await resolveConfig({
            browserbaseApiKey,
            browserbaseProjectId,
            proxies: req.headers.get("x-proxies") === "true",
            browserSettings: {
              viewport: {
                width: req.headers.get("x-browser-width") ?? 1024,
                height: req.headers.get("x-browser-height") ?? 768,
              },
              context: req.headers.get("x-context-id") ? {
                id: req.headers.get("x-context-id"),
                persist: req.headers.get("x-persist") === "true",
              } : undefined,
              advancedStealth: req.headers.get("x-advanced-stealth") === "true",
            }
          });

          const contextKey = `${browserbaseProjectId}:${contextId || 'default'}`;
          
          let callContext: Context;
          if (contextMap.has(contextKey)) {
            callContext = contextMap.get(contextKey)!;
            console.log(`Reusing existing context for ${contextKey}`);
            callContext.config = requestConfig;
          } else {
            callContext = new Context(server, requestConfig);
            contextMap.set(contextKey, callContext);
            console.log(`Created new context for ${contextKey}`);
          }
          
          console.log(`Executing tool: ${tool.schema.name} with params:`, params, "Config params:", requestConfig);

          try {
            return await callContext.run(tool, params);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error running tool ${tool.schema.name}: ${errorMessage}`);
            throw new Error(`Failed to run tool '${tool.schema.name}': ${errorMessage}`);
          }
        }
      );
    } else {
      console.warn(
        `Tool "${tool.schema.name}" has an input schema that is not a ZodObject and will not be registered with the mcp-adapter directly. Schema type: ${tool.schema.inputSchema.constructor.name}`
      );
    }
  });

  return server;
};

const mcpHandlerInstance = (req: Request) => {
  return createMcpHandler(
    mcpServerFactory(req),
    {
      capabilities: {
        resources: { list: true, read: true },
        tools: { list: true, call: true },
        prompts: { list: true, get: true },
        notifications: { resources: { list_changed: true } },
      }
    },
    {
      redisUrl: process.env.REDIS_URL,
      basePath: "",
      verboseLogs: true,
      maxDuration: 60,
    }
  )(req);
};

const handler = withMcpAuth(mcpHandlerInstance);

export { handler as GET, handler as POST, handler as DELETE };