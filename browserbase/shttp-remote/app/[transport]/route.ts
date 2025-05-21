import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import { withMcpAuth } from "@/lib/auth";

import navigate from "../../tools/navigate";
import common from "../../tools/common";
import snapshot from "../../tools/snapshot";
import keyboard from "../../tools/keyboard";
import getText from "../../tools/getText";
import session from "../../tools/session";
import contextTools from "../../tools/context";
import type { Tool } from "../../tools/tool";

const allTools: Tool<any>[] = [
  ...common,
  ...snapshot,
  ...keyboard,
  ...getText,
  ...navigate,
  ...session,
  ...contextTools,
];

const createHandler = (req: Request) => {
  const apiKey = req.headers.get("x-api-key");
  const projectId = req.headers.get("x-project-id");
  
  console.log(`Request from user: ${apiKey}, project: ${projectId || 'unspecified'}`);

  return createMcpHandler(
    (server) => {
      allTools.forEach(tool => {
        if (tool.schema.inputSchema instanceof z.ZodObject) {
          server.tool(
            tool.schema.name,
            tool.schema.description,
            tool.schema.inputSchema.shape,
            async (params: z.infer<typeof tool.schema.inputSchema>, extra: any) => {
              console.log(`Executing tool: ${tool.schema.name} with params:`, params, "Extra:", extra);
              
              const responseContent: { type: "text"; text: string }[] = [
                { type: "text", text: `Executed ${tool.schema.name}` },
              ];

              return {
                content: responseContent,
              };
            }
          );
        } else {
          console.warn(
            `Tool "${tool.schema.name}" has an input schema that is not a ZodObject and will not be registered with the mcp-adapter directly. Schema type: ${tool.schema.inputSchema.constructor.name}`
          );
        }
      });
    },
    {
      capabilities: {
        tools: allTools.reduce((acc, tool) => {
          acc[tool.schema.name] = {
            description: tool.schema.description,
          };
          return acc;
        }, {} as Record<string, { description: string }>),
      },
    },
    {
      redisUrl: process.env.REDIS_URL,
      basePath: "",
      verboseLogs: true,
      maxDuration: 60,
    }
  )(req);
};

// Create and wrap the handler with auth
const handler = withMcpAuth(createHandler);

export { handler as GET, handler as POST, handler as DELETE };
