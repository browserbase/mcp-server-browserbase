import { program } from "commander";

import createServerFunction from "./index.js";
import { ServerList } from "./server.js";
import { startHttpTransport, startStdioTransport } from "./transport.js";

import { resolveConfig } from "./config.js";

// Import package.json directly using ESM JSON import (no fs needed)
import packageJSON from "../package.json" with { type: "json" };

program
  .version("Version " + packageJSON.version)
  .name(packageJSON.name)
  .option("--browserbaseApiKey <key>", "The Browserbase API Key to use")
  .option("--browserbaseProjectId <id>", "The Browserbase Project ID to use")
  .option("--proxies", "Use Browserbase proxies.")
  .option(
    "--advancedStealth",
    "Use advanced stealth mode. Only available to Browserbase Scale Plan users.",
  )
  .option("--contextId <contextId>", "Browserbase Context ID to use.")
  .option(
    "--persist [boolean]",
    "Whether to persist the Browserbase context",
    true,
  )
  .option("--port <port>", "Port to listen on for SHTTP transport.")
  .option(
    "--host <host>",
    "Host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.",
  )
  .option("--browserWidth <width>", "Browser width to use for the browser.")
  .option("--browserHeight <height>", "Browser height to use for the browser.")
  .option(
    "--modelName <model>",
    "The model to use for Stagehand (default: gemini-2.0-flash)",
  )
  .option(
    "--modelApiKey <key>",
    "API key for the custom model provider (required when using custom models)",
  )
  .option("--keepAlive", "Enable Browserbase Keep Alive Session")
  .option("--experimental", "Enable experimental features")
  .action(async (options) => {
    const config = await resolveConfig(options);
    const serverList = new ServerList(async () =>
      createServerFunction({
        config: config,
      }),
    );
    setupExitWatchdog(serverList);

    if (options.port)
      startHttpTransport(+options.port, options.host, serverList);
    else await startStdioTransport(serverList, config);
  });

function setupExitWatchdog(serverList: ServerList) {
  const handleExit = async () => {
    setTimeout(() => process.exit(0), 15000);
    try {
      // SessionManager within each server handles session cleanup
      await serverList.closeAll();
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
    process.exit(0);
  };

  process.stdin.on("close", handleExit);
  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);
}

program.parse(process.argv);
