import navigateTool from "./navigate.js";
import actTool from "./act.js";
import extractTool from "./extract.js";
import observeTool from "./observe.js";
import sessionTools from "./session.js";

// Export individual tools
export { default as navigateTool } from "./navigate.js";
export { default as actTool } from "./act.js";
export { default as extractTool } from "./extract.js";
export { default as observeTool } from "./observe.js";
export { default as sessionTools } from "./session.js";

// Export all tools as array — matches hosted MCP server at mcp.browserbase.com
export const TOOLS = [
  ...sessionTools,
  navigateTool,
  actTool,
  observeTool,
  extractTool,
];

export const sessionManagementTools = sessionTools;
