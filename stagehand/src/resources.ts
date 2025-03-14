/**
 * Resources module for the Stagehand MCP server
 * Contains resources definitions and handlers for resource-related requests
 */

// Define the resources
export const RESOURCES = [];

// Define the resource templates
export const RESOURCE_TEMPLATES = [];

/**
 * Handle listing resources request
 * @returns An empty resources list response
 */
export function listResources() {
  return { resources: [] };
}

/**
 * Handle listing resource templates request
 * @returns An empty resource templates list response
 */
export function listResourceTemplates() {
  return { resourceTemplates: [] };
} 