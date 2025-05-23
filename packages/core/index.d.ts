import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

import type { Config } from './config';

export declare function createServer(config?: Config): Promise<Server>;
export {};