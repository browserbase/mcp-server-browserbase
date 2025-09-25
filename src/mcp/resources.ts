/**
 * Resources module for the Browserbase MCP server
 * Contains resources definitions and handlers for resource-related requests
 * Docs: https://modelcontextprotocol.io/docs/concepts/resources
 */

// Define the resources
export const RESOURCES = [];

// Define the resource templates
export const RESOURCE_TEMPLATES = [];

// Store screenshots in a map
export const screenshots = new Map<string, string>();

// Track screenshots by session so we can purge them on session end
// key: sessionId (internal/current session id), value: set of screenshot names
const sessionIdToScreenshotNames = new Map<string, Set<string>>();

export function registerScreenshot(
  sessionId: string,
  name: string,
  base64: string,
) {
  screenshots.set(name, base64);
  let set = sessionIdToScreenshotNames.get(sessionId);
  if (!set) {
    set = new Set();
    sessionIdToScreenshotNames.set(sessionId, set);
  }
  set.add(name);
}

export function clearScreenshotsForSession(sessionId: string) {
  const set = sessionIdToScreenshotNames.get(sessionId);
  if (set) {
    for (const name of set) {
      screenshots.delete(name);
    }
    sessionIdToScreenshotNames.delete(sessionId);
  }
}

export function clearAllScreenshots() {
  screenshots.clear();
  sessionIdToScreenshotNames.clear();
}

/**
 * Retry wrapper for clearing screenshots for a session. Uses exponential backoff.
 * This protects against transient failures in any consumer of the map.
 */
export async function retryClearScreenshotsForSession(
  sessionId: string,
  options: { retries?: number; initialDelayMs?: number } = {},
): Promise<void> {
  const retries = options.retries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 50;

  let attempt = 0;
  let delay = initialDelayMs;
  // Attempt at least once
  while (true) {
    try {
      clearScreenshotsForSession(sessionId);
      return;
    } catch (err) {
      if (attempt >= retries) {
        // Give up
        throw err instanceof Error ? err : new Error(String(err));
      }
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
      delay = Math.min(delay * 2, 1000);
    }
  }
}

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
    ],
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
