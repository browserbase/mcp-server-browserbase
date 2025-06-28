import type {
  ImageContent,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { Context } from "../context.js";

export type ToolSchema<Input extends InputType> = {
  name: string;
  description: string;
  inputSchema: Input;
};

// Export InputType
export type InputType = z.Schema;

export type ToolActionResult =
  | { content?: (ImageContent | TextContent)[] }
  | undefined
  | void;

export type ToolResult = {
  action?: () => Promise<ToolActionResult>;
  waitForNetwork: boolean;
};

export type Tool<Input extends InputType = InputType> = {
  capability: string;
  schema: ToolSchema<Input>;
  handle: (context: Context, params: z.output<Input>) => Promise<ToolResult>;
};

export function defineTool<Input extends InputType>(
  tool: Tool<Input>,
): Tool<Input> {
  return tool;
}

export {}; // Ensure this is treated as a module
