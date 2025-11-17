import type { Stagehand, Page } from "@browserbasehq/stagehand";
import { ImageContent, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { Tool } from "../tools/tool.js";
import { InputType } from "../tools/tool.js";

export type StagehandSession = {
  id: string; // MCP-side ID
  stagehand: Stagehand; // owns the Browserbase session
  page: Page;
  created: number;
  metadata?: Record<string, any>; // optional extras (proxy, contextId, bbSessionId)
};

export type CreateSessionParams = {
  apiKey?: string;
  projectId?: string;
  modelName?: string;
  modelApiKey?: string;
  browserbaseSessionID?: string;
  browserbaseSessionCreateParams?: any;
  meta?: Record<string, any>;
};

export type BrowserSession = {
  page: Page;
  sessionId: string;
  stagehand: Stagehand;
};

export type ToolActionResult =
  | { content?: (ImageContent | TextContent)[] }
  | undefined
  | void;

// Type for the tools array used in MCP server registration
export type MCPTool = Tool<InputType>;
export type MCPToolsArray = MCPTool[];
