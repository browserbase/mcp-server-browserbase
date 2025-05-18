import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createServer } from './index.js';
import { ServerList } from './server.js';

import { startHttpTransport, startStdioTransport } from './transport.js';

import { resolveConfig } from './config.js';

// Determine the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load package.json using fs
const packageJSONPath = path.resolve(__dirname, '../package.json');
const packageJSONBuffer = fs.readFileSync(packageJSONPath);
const packageJSON = JSON.parse(packageJSONBuffer.toString());

program
    .version('Version ' + packageJSON.version)
    .name(packageJSON.name)
    .option('--browserbaseApiKey <key>', 'The Browserbase API Key to use')
    .option('--browserbaseProjectId <id>', 'The Browserbase Project ID to use')
    .option('--proxies', 'Use Browserbase proxies.')
    .option('--advancedStealth', 'Use advanced stealth mode. Only available to Browserbase Scale Plan users.')
    .option('--contextId <contextId>', 'Browserbase Context ID to use.')
    .option('--persist [boolean]', 'Whether to persist the Browserbase context', true)
    .option('--port <port>', 'Port to listen on for SSE transport.')
    .option('--host <host>', 'Host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.')
    .option('--cookies [json]', 'JSON array of cookies to inject into the browser. Format: [{"name":"cookie1","value":"val1","domain":"example.com"}, ...]')
    .option('--browserWidth <width>', 'Browser width to use for the browser.')
    .option('--browserHeight <height>', 'Browser height to use for the browser.')
    .action(async options => {
      const config = await resolveConfig(options);
      const serverList = new ServerList(async() => createServer(config));
      setupExitWatchdog(serverList);

      if (options.port)
        startHttpTransport(+options.port, options.host, serverList);
      else
        await startStdioTransport(serverList);
    });

function setupExitWatchdog(serverList: ServerList) {
  const handleExit = async () => {
    setTimeout(() => process.exit(0), 15000);
    await serverList.closeAll();
    process.exit(0);
  };

  process.stdin.on('close', handleExit);
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}

program.parse(process.argv);