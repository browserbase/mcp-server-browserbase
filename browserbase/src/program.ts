import { program } from 'commander';

import { createServer } from './index.js';
import { ServerList } from './server.js';

import { startHttpTransport, startStdioTransport } from './transport.js';

import { resolveConfig } from './config.js';

import packageJSON from '../package.json'; 

program
    .version('Version ' + packageJSON.version)
    .name(packageJSON.name)
    .option('--proxies', 'Use Browserbase proxies.')
    .option('--context <context>', 'Browserbase Context to use.')
    .option('--port <port>', 'Port to listen on for SSE transport.')
    .option('--host <host>', 'Host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.')
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