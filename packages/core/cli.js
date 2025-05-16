#!/usr/bin/env node
import navigate from './dist/tools/navigate.js';
import snapshot from './dist/tools/snapshot.js';
import keyboard from './dist/tools/keyboard.js';
import getText from './dist/tools/getText.js';
import session from './dist/tools/session.js';
import common from './dist/tools/common.js';
import contextTools from './dist/tools/context.js';
import { defineTool } from './dist/tools/tool.js';

import { Context } from './dist/context.js';
import { resolveConfig, defaultConfig } from './dist/config.js';

export { Context, resolveConfig, defaultConfig };

// Export individual tools
export { navigate, snapshot, keyboard, getText, session, common, contextTools, defineTool as Tool };

// Run the CLI if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  await import('./dist/program.js');
}