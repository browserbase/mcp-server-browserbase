/**
 * Resources module for the Browserbase MCP server
 * Docs: https://modelcontextprotocol.io/docs/concepts/resources
 */

export const RESOURCES = [];

export const RESOURCE_TEMPLATES = [];

export function listResources() {
  return { resources: [] };
}

export function listResourceTemplates() {
  return { resourceTemplates: [] };
}

export function readResource(uri: string) {
  return { contents: [{ uri, text: `Resource not found: ${uri}` }] };
}
