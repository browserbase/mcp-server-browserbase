import http from 'node:http';
import assert from 'node:assert';
import crypto from 'node:crypto';

import { ServerList } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from '../config.js';

export async function startStdioTransport(serverList: ServerList) {
  const server = await serverList.create();
  await server.connect(new StdioServerTransport());
}

// Extract configuration from URL search parameters
function extractConfigFromURL(url: URL): Partial<Config> {
  const config: Partial<Config> = {};
  
  // Extract basic parameters
  if (url.searchParams.has('browserbaseApiKey')) {
    config.browserbaseApiKey = url.searchParams.get('browserbaseApiKey') || undefined;
  }
  
  if (url.searchParams.has('browserbaseProjectId')) {
    config.browserbaseProjectId = url.searchParams.get('browserbaseProjectId') || undefined;
  }
  
  // Boolean flags
  if (url.searchParams.has('proxies')) {
    config.proxies = url.searchParams.get('proxies') === 'true';
  }
  
  if (url.searchParams.has('advancedStealth')) {
    config.advancedStealth = url.searchParams.get('advancedStealth') === 'true';
  }
  
  // Context settings
  if (url.searchParams.has('contextId')) {
    config.context = {
      contextId: url.searchParams.get('contextId') || undefined,
      persist: url.searchParams.has('persist') ? url.searchParams.get('persist') === 'true' : true
    };
  }
  
  // Viewport settings
  const browserWidth = url.searchParams.get('browserWidth');
  const browserHeight = url.searchParams.get('browserHeight');
  if (browserWidth || browserHeight) {
    config.viewPort = {};
    if (browserWidth) config.viewPort.browserWidth = parseInt(browserWidth, 10);
    if (browserHeight) config.viewPort.browserHeight = parseInt(browserHeight, 10);
  }
  
  return config;
}

async function handleSSE(req: http.IncomingMessage, res: http.ServerResponse, url: URL, serverList: ServerList, sessions: Map<string, SSEServerTransport>) {
  if (req.method === 'POST') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      res.statusCode = 400;
      return res.end('Missing sessionId');
    }

    const transport = sessions.get(sessionId);
    if (!transport) {
      res.statusCode = 404;
      return res.end('Session not found');
    }

    return await transport.handlePostMessage(req, res);
  } else if (req.method === 'GET') {
    // Extract configuration from URL parameters
    const config = extractConfigFromURL(url);
    
    const transport = new SSEServerTransport('/sse', res);
    sessions.set(transport.sessionId, transport);
    const server = await serverList.create(config);
    res.on('close', () => {
      sessions.delete(transport.sessionId);
      serverList.close(server).catch(e => {
        // eslint-disable-next-line no-console
        // console.error(e);
      });
    });
    return await server.connect(transport);
  }

  res.statusCode = 405;
  res.end('Method not allowed');
}

// Export for remote
export async function handleStreamable(req: http.IncomingMessage, res: http.ServerResponse, url: URL, serverList: ServerList, sessions: Map<string, StreamableHTTPServerTransport>) {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.statusCode = 404;
      res.end('Session not found');
      return;
    }
    return await transport.handleRequest(req, res);
  }

  if (req.method === 'POST') {
    // Extract configuration from URL parameters
    const config = extractConfigFromURL(url);
    
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: sessionId => {
        sessions.set(sessionId, transport);
      }
    });
    transport.onclose = () => {
      if (transport.sessionId)
        sessions.delete(transport.sessionId);
    };
    const server = await serverList.create(config);
    await server.connect(transport);
    return await transport.handleRequest(req, res);
  }

  res.statusCode = 400;
  res.end('Invalid request');
}

export function startHttpTransport(port: number, hostname: string | undefined, serverList: ServerList) {
  const sseSessions = new Map<string, SSEServerTransport>();
  const streamableSessions = new Map<string, StreamableHTTPServerTransport>();
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(`http://localhost${req.url}`);
    if (url.pathname.startsWith('/mcp'))
      await handleStreamable(req, res, url, serverList, streamableSessions);
    else
      await handleSSE(req, res, url, serverList, sseSessions);
  });
  httpServer.listen(port, hostname, () => {
    const address = httpServer.address();
    assert(address, 'Could not bind server socket');""
    let url: string;
    if (typeof address === 'string') {
      url = address;
    } else {
      const resolvedPort = address.port;
      let resolvedHost = address.family === 'IPv4' ? address.address : `[${address.address}]`;
      if (resolvedHost === '0.0.0.0' || resolvedHost === '[::]')
        resolvedHost = 'localhost';
      url = `http://${resolvedHost}:${resolvedPort}`;
    }
    
    // Build examples
    const sseExample = `${url}/sse`;
    const mcpExample = `${url}/mcp?browserbaseApiKey=YOUR_API_KEY&browserbaseProjectId=YOUR_PROJECT_ID`;
    const mcpAdvancedExample = `${url}/mcp?browserbaseApiKey=YOUR_API_KEY&browserbaseProjectId=YOUR_PROJECT_ID&proxies=true&browserWidth=1920&browserHeight=1080&contextId=your-context-id`;
    
    const message = [
      `🚀 Browserbase MCP Server listening on ${url}`,
      '',
      '📋 Basic Client Config (SSE Transport):',
      JSON.stringify({
        'mcpServers': {
          'browserbase': {
            'url': sseExample
          }
        }
      }, undefined, 2),
      '',
      '🌐 If your client supports Streamable HTTP, you can use the /mcp endpoint with URL parameters:',
      '',
      '⚙️ Basic configuration with API credentials:',
      mcpExample,
      '',
      '⚙️ Advanced configuration example:',
      mcpAdvancedExample,
      '',
      '📝 Available URL parameters:',
      '- browserbaseApiKey: Your Browserbase API key',
      '- browserbaseProjectId: Your Browserbase project ID',
      '- proxies: true/false to enable/disable proxies',
      '- advancedStealth: true/false to enable/disable advanced stealth mode',
      '- contextId: ID of an existing Browserbase context to use',
      '- persist: true/false to enable/disable context persistence',
      '- browserWidth: Browser viewport width in pixels',
      '- browserHeight: Browser viewport height in pixels',
    ].join('\n');
    
    // eslint-disable-next-line no-console
    console.log(message);
  });
}