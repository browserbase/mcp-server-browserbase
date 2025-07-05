import navigateTool from "./navigate.js";
import actTool from "./act.js";
import extractTool from "./extract.js";
import observeTool from "./observe.js";
import screenshotTool from "./screenshot.js";
import sessionTools from "./session.js";
import {
  createSessionTool,
  listSessionsTool,
  closeSessionTool,
  navigateWithSessionTool,
  actWithSessionTool,
  extractWithSessionTool,
  observeWithSessionTool,
} from "./multiSession.js";

// Export individual tools
export { default as navigateTool } from "./navigate.js";
export { default as actTool } from "./act.js";
export { default as extractTool } from "./extract.js";
export { default as observeTool } from "./observe.js";
export { default as screenshotTool } from "./screenshot.js";
export { default as sessionTools } from "./session.js";

// Multi-session tools array
export const multiSessionTools = [
  createSessionTool,
  listSessionsTool,
  closeSessionTool,
  navigateWithSessionTool,
  actWithSessionTool,
  extractWithSessionTool,
  observeWithSessionTool,
];

// Export all tools as array
export const TOOLS = [
  ...multiSessionTools,
  ...sessionTools,
  navigateTool,
  actTool,
  extractTool,
  observeTool,
  screenshotTool,
];

export const sessionManagementTools = sessionTools;
