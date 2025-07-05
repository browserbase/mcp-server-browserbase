#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import {
  ensureLogDirectory,
  registerExitHandlers,
  scheduleLogRotation,
  setupLogRotation,
} from "./logging.js";
import { startStaticHttpServer } from "./httpStaticServer.js";

// Run setup for logging
ensureLogDirectory();
setupLogRotation();
scheduleLogRotation();
registerExitHandlers();

// Start the static HTTP server for /tmp and capture the port
const { port: staticHttpPort } = startStaticHttpServer();

// Run the server
async function runServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  server.sendLoggingMessage({
    level: "info",
    data: `Stagehand MCP server is ready to accept requests. Static HTTP server running on port ${staticHttpPort}`,
  });
}

runServer().catch((error) => {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error(errorMsg);
});
