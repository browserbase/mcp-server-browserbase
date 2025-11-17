import http from "node:http";
import assert from "node:assert";
import crypto from "node:crypto";

import { ServerList } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config } from "../config.d.ts";

export async function startStdioTransport(
  serverList: ServerList,
  config?: Config,
) {
  // Check if we're using the default model without an API key
  if (config) {
    const modelName = config.modelName || "gemini-2.0-flash";
    const hasModelApiKey =
      config.modelApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (modelName.includes("gemini") && !hasModelApiKey) {
      console.error(
        `Need to set GEMINI_API_KEY or GOOGLE_API_KEY in your environment variables`,
      );
    }
  }

  const server = await serverList.create();
  await server.connect(new StdioServerTransport());
}

async function handleStreamable(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  serverList: ServerList,
  sessions: Map<string, StreamableHTTPServerTransport>,
) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.statusCode = 404;
      res.end("Session not found");
      return;
    }
    return await transport.handleRequest(req, res);
  }

  if (req.method === "POST") {
    const sessionId = crypto.randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });
    sessions.set(sessionId, transport);
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const server = await serverList.create();
    await server.connect(transport);
    return await transport.handleRequest(req, res);
  }

  res.statusCode = 400;
  res.end("Invalid request");
}

export function startHttpTransport(
  port: number,
  hostname: string | undefined,
  serverList: ServerList,
) {
  // In-memory Map of SHTTP sessions
  const streamableSessions = new Map<string, StreamableHTTPServerTransport>();
  const httpServer = http.createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad request: missing URL");
      return;
    }
    const url = new URL(`http://localhost${req.url}`);
    if (url.pathname.startsWith("/mcp"))
      await handleStreamable(req, res, serverList, streamableSessions);
  });
  httpServer.listen(port, hostname, () => {
    const address = httpServer.address();
    assert(address, "Could not bind server socket");
    let url: string;
    if (typeof address === "string") {
      url = address;
    } else {
      const resolvedPort = address.port;
      let resolvedHost =
        address.family === "IPv4" ? address.address : `[${address.address}]`;
      if (resolvedHost === "0.0.0.0" || resolvedHost === "[::]")
        resolvedHost = "localhost";
      url = `http://${resolvedHost}:${resolvedPort}`;
    }
    const message = [
      `Listening on ${url}`,
      "Put this in your client config:",
      JSON.stringify(
        {
          mcpServers: {
            browserbase: {
              type: "http",
              url: `${url}/mcp`,
            },
          },
        },
        undefined,
        2,
      ),
      "If your client supports streamable HTTP, you can use the /mcp endpoint instead.",
    ].join("\n");
    console.log(message);
  });
}
