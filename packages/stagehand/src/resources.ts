/**
 * Resources module for the Stagehand MCP server
 * Contains resources definitions and handlers for resource-related requests
 */

// Define the resources
export const RESOURCES = [];

// Define the resource templates
export const RESOURCE_TEMPLATES = [];

// Store screenshots in a map
export const screenshots = new Map<string, string>();

/**
 * Handle listing resources request
 * @returns A list of available resources including screenshots
 */
export function listResources() {
  return { 
    resources: [
      ...Array.from(screenshots.keys()).map((name) => ({
        uri: `screenshot://${name}`,
        mimeType: "image/png",
        name: `Screenshot: ${name}`,
      })),
    ]
  };
}

/**
 * Handle listing resource templates request
 * @returns An empty resource templates list response
 */
export function listResourceTemplates() {
  return { resourceTemplates: [] };
}

/**
 * Read a resource by its URI
 * @param uri The URI of the resource to read
 * @returns The resource content or throws if not found
 */
export function readResource(uri: string) {
  if (uri.startsWith("screenshot://")) {
    const name = uri.split("://")[1];
    const screenshot = screenshots.get(name);
    if (screenshot) {
      return {
        contents: [
          {
            uri,
            mimeType: "image/png",
            blob: screenshot,
          },
        ],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
} 