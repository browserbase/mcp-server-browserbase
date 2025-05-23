import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { defineTool, navigate, common, snapshot, keyboard, getText, session, Context, resolveConfig, PageSnapshot } from "@mcp/core";
import { withMcpAuth } from "@/lib/auth";
import { loadCtx, saveCtx, type CachedResources, type CachedSnapshot, deleteCtx } from "@/lib/redis";

const needAuthTools = [
  "browserbase_session_create",
  "browserbase_session_close",
];

const mcpServerFactory = (req: Request) => async (server: any) => {
  const tools: defineTool<any>[] = [
    ...common,
    ...snapshot,
    ...keyboard,
    ...getText,
    ...navigate,
    ...session,
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
          
          if (!browserbaseApiKey || !browserbaseProjectId) {
            throw new Error("Project ID is required for tool execution");
          }
          
          let requestConfig;

          if(needAuthTools.includes(tool.schema.name)) {
            requestConfig = await resolveConfig({
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
          }

          // Handle session creation tools by clearing previous cached data
          if (tool.schema.name === "browserbase_session_create") {
            try {
              // Clear any existing cached context for this project when creating a new session
              await deleteCtx(browserbaseProjectId);
              console.log(`Cleared existing cached context for ${browserbaseProjectId} during session creation`);
            } catch (clearErr) {
              console.warn(`Failed to clear cached context: ${clearErr}`);
            }
          }

          // Load cached context data from Redis
          const cachedCtx = await loadCtx(browserbaseProjectId);
          
          // Create a fresh Context instance for this request
          const callContext = new Context(server, requestConfig);
          
          // Rehydrate the context with cached data if available
          if (cachedCtx?.session?.currentSessionId) {
            callContext.currentSessionId = cachedCtx.session.currentSessionId;
          }
          
          if (cachedCtx?.resources) {
            // @ts-ignore - accessing private property
            callContext.screenshotResources = new Map(
              Object.entries(cachedCtx.resources)
            );
          }

          // Rehydrate the snapshots if available
          const deserializedSnapshots = new Map<string, PageSnapshot>();
          if (cachedCtx?.snapshots && cachedCtx.snapshots.length > 0) {
            try {
              for (const snapshot of cachedCtx.snapshots) {
                try {
                  // Create a new PageSnapshot from the serialized data
                  const deserializedSnapshot = PageSnapshot.fromSerialized(snapshot.serializedData);
                  if (deserializedSnapshot) {
                    deserializedSnapshots.set(snapshot.sessionId, deserializedSnapshot);
                  }
                } catch (e) {
                  console.warn(`Failed to deserialize snapshot for session ${snapshot.sessionId}:`, e);
                }
              }
              
              // @ts-ignore - accessing private property
              callContext.latestSnapshots = deserializedSnapshots;
            } catch (e) {
              console.warn('Failed to rehydrate snapshots:', e);
            }
          }
          
          console.log(`Executing tool: ${tool.schema.name} with params:`, params, "Config params:", requestConfig);

          try {
            // Special handling for closing a session to avoid creating a new default session
            if (tool.schema.name === "browserbase_session_close") {
              // Run the tool with the rehydrated context
              const result = await callContext.run(tool, params);

              try {
                await deleteCtx(browserbaseProjectId);
                console.log(`Deleted cached context for ${browserbaseProjectId} after session close`);
              } catch (deleteErr) {
                console.warn(`Failed to delete cached context after session close: ${deleteErr}`);
              }
              
              return result;
            }
            else if (tool.schema.name !== "browserbase_session_close") {
              // Special handling for tools that require active snapshots to be reconnected
              if (tool.schema.name.startsWith('browserbase_') && 
                  !['browserbase_session_create', 'browserbase_session_close', 'browserbase_snapshot', 'browserbase_navigate'].includes(tool.schema.name)) {
                
                // Get the active page to reconnect the snapshot
                const activePage = await callContext.getActivePage();
                
                if (activePage) {
                  // Get the current session ID
                  const sessionId = callContext.currentSessionId;
                  
                  // Check if we have a snapshot for this session
                  // @ts-ignore - accessing private property
                  const snapshot = callContext.latestSnapshots.get(sessionId);
                  
                  if (snapshot && snapshot.needsReconnection()) {
                    // Reconnect the snapshot to the active page
                    snapshot.reconnect(activePage);
                    console.log(`Reconnected snapshot for session ${sessionId} to active page`);
                  } else if (!snapshot) {
                    // If there's no snapshot, capture a new one
                    console.log(`No snapshot available for session ${sessionId}, capturing a new one`);
                    await callContext.captureSnapshot();
                  }
                }
              }
            }
            
            // Run the tool with the rehydrated context
            const result = await callContext.run(tool, params);
            
            // After tool execution, persist the updated context data back to Redis
            try {
              // Extract and save resources
              // @ts-ignore - accessing private property
              const resourcesMap = callContext.screenshotResources;
              const resources: CachedResources = resourcesMap instanceof Map ? 
                Object.fromEntries(resourcesMap) : {};
              
              // Extract and save snapshots
              // @ts-ignore - accessing private property
              const latestSnapshots = callContext.latestSnapshots;
              const snapshots: CachedSnapshot[] = [];
              
              if (latestSnapshots instanceof Map) {
                for (const [sessionId, snapshot] of latestSnapshots.entries()) {
                  try {
                    // Get serialized representation of the snapshot
                    const serializedData = snapshot.serialize();
                    snapshots.push({
                      sessionId,
                      serializedData
                    });
                  } catch (e) {
                    console.warn(`Failed to serialize snapshot for session ${sessionId}:`, e);
                  }
                }
              }
              
              await saveCtx(browserbaseProjectId, {
                session: { 
                  currentSessionId: callContext.currentSessionId 
                },
                resources,
                snapshots,
                meta: {
                  updatedAt: Date.now()
                }
              });
            } catch (cacheError) {
              console.error('Failed to cache context:', cacheError);
            }
            
            return result;
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
      // redisUrl: process.env.REDIS_URL, 
      basePath: "",
      verboseLogs: true,
      maxDuration: 60,
    }
  )(req);
};

const handler = withMcpAuth(mcpHandlerInstance);

export { handler as GET, handler as POST, handler as DELETE };