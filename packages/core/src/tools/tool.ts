import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { Context } from '../context.js';
import type * as playwright from 'playwright';
import type { ToolCapability } from '../config.js'; 
import type { BrowserSession } from '../sessionManager.js'; 
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'; 
import type { Config } from '../config.js'; 

export type ToolSchema<Input extends InputType> = {
  name: string;
  description: string;
  inputSchema: Input;
};

// Export InputType
export type InputType = z.Schema;

export type FileUploadModalState = {
  type: 'fileChooser';
  description: string;
  fileChooser: playwright.FileChooser;
};

export type DialogModalState = {
  type: 'dialog';
  description: string;
  dialog: playwright.Dialog;
};

export type ModalState = FileUploadModalState | DialogModalState;

export type ToolActionResult = { content?: (ImageContent | TextContent)[] } | undefined | void;

export type ToolResult = {
  code: string[];
  action?: () => Promise<ToolActionResult>;
  captureSnapshot: boolean;
  waitForNetwork: boolean;
  resultOverride?: ToolActionResult;
};

export type Tool<Input extends InputType = InputType> = {
    capability: ToolCapability;
    schema: ToolSchema<Input>;
    clearsModalState?: ModalState['type'];
    handle: (context: Context, params: z.output<Input>) => Promise<ToolResult>;
  };
  
  export type ToolFactory = (snapshot: boolean) => Tool<any>;
  
  export function defineTool<Input extends InputType>(tool: Tool<Input>): Tool<Input> {
    return tool;
  }
  
export {}; // Ensure this is treated as a module 

// Represents the execution context for a tool
// Might include the page, server instance for notifications, etc.
export interface ToolContext {
    page: BrowserSession['page'];
    browser: BrowserSession['browser'];
    server: Server;
    sessionId: string;
    config: Config;
    context: Context; // The main context instance
} 