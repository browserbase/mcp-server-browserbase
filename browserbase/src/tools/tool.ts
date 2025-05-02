import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Keep only CallToolResult
import type { BrowserSession } from '../sessionManager.js'; // Context needs session
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'; // For notifications
import type { Config } from '../../config.js'; // Import Config type
import type { Context } from '../context.js'; // Forward declaration for context property
import { z } from 'zod';

// Represents the execution context for a tool
// Might include the page, server instance for notifications, etc.
export interface ToolContext {
    page: BrowserSession['page'];
    browser: BrowserSession['browser'];
    server: Server;
    // Add other context if needed, e.g., session ID
    sessionId: string;
    config: Config; // Add config to context
    context: Context; // Add context itself for access to e.g. addScreenshot
}

// Input type alias based on Zod Schema
export type InputType = z.Schema;

// ToolSchema expects a Zod schema for inputSchema
export type ToolSchema<Input extends InputType = InputType> = {
    name: string;
    description: string;
    inputSchema: Input; // Use the Zod schema type
};

// Tool interface DEFINITIVELY uses run and CallToolResult
export interface Tool<Input extends InputType = InputType, Output = CallToolResult> {
    schema: ToolSchema<Input>;
    // Use run, expecting args inferred from Zod schema
    run: (context: ToolContext, args: z.infer<Input>) => Promise<Output>;
}

// --- REMOVED Handle-based types --- 
// export type ToolCapability = ...;
// export type ModalState = ...;
// export type ToolActionResult = ...;
// export type ToolResult = ...;
// export interface ToolHandleBased<...> { ... }
// export type ToolFactory = ...; 
// export function defineTool<...> { ... }

export {}; // Ensure this is treated as a module 

// --- Types needed for Playwright-style handle pattern (Keep for reference/potential future use) ---
// These are NOT used by the primary Tool interface above but might be referenced
// by code we haven't fully reverted yet.
// export type ToolCapability = ...; 
// export type ToolHandleBased<Input extends InputType = InputType> { 
//   capability: ToolCapability;
//   schema: ToolSchema<Input>;
//   clearsModalState?: ModalState['type'];
//   handle: (context: Context, params: z.output<Input>) => Promise<ToolResult>;
// }
// export type ToolFactory = (captureSnapshot: boolean) => ToolHandleBased<any>[]; // Factory returns handle-based tools
// export function defineTool<Input extends InputType>(tool: ToolHandleBased<Input>): ToolHandleBased<Input> {
//   return tool;
// }
// --- End of Handle-based types ---

export {}; 