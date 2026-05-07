import { program } from "commander";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import createServerFunction from "./index.js";
import { ServerList } from "./server.js";
import { startHttpTransport, startStdioTransport } from "./transport.js";

import { resolveConfig } from "./config.js";

let __filename: string;
let __dirname: string;

try {
  // Try ES modules first
  __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch {
  // Fallback for CommonJS or when import.meta is not available
  __filename =
    (globalThis as { __filename: string }).__filename ||
    process.cwd() + "/dist/program.js";
  __dirname = path.dirname(__filename);
}

// Load package.json using fs
const packageJSONPath = path.resolve(__dirname, "../package.json");
const packageJSONBuffer = fs.readFileSync(packageJSONPath);
const packageJSON = JSON.parse(packageJSONBuffer.toString());

program
  .version("Version " + packageJSON.version)
  .name(packageJSON.name)
  .option("--browserbaseApiKey <key>", "The Browserbase API Key to use")
  .option("--browserbaseProjectId <id>", "The Browserbase Project ID to use")
  .option("--proxies", "Use Browserbase proxies.")
  .option(
    "--verified",
    "Use Browserbase Verified Identity. Only available to Browserbase Scale Plan users.",
  )
  .option("--advancedStealth", "Deprecated alias for --verified.")
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
    "The model to use for Stagehand (default: google/gemini-2.5-flash-lite)",
  )
  .option(
    "--modelApiKey <key>",
    "Optional API key for a custom model provider. When omitted, Browserbase routes supported provider/model names through the model gateway.",
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
    else await startStdioTransport(serverList);
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
