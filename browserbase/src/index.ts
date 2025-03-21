#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  TextContent,
  ImageContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { Browserbase } from "@browserbasehq/sdk";

// Environment variables configuration
const requiredEnvVars = {
  BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
  BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
};

// Validate required environment variables
Object.entries(requiredEnvVars).forEach(([name, value]) => {
  if (!value) throw new Error(`${name} environment variable is required`);
});

// 2. Global State
const browsers = new Map<string, { browser: Browser; page: Page }>();
const screenshots = new Map<string, string>();

// Global state variable for the default browser session
let defaultBrowserSession: { browser: Browser; page: Page } | null = null;
const sessionId = "default"; // Using a consistent session ID for the default session

// Ensure browser session is initialized and valid
async function ensureBrowserSession(): Promise<{
  browser: Browser;
  page: Page;
}> {
  try {
    // If no session exists, create one
    if (!defaultBrowserSession) {
      defaultBrowserSession = await createNewBrowserSession(sessionId);
      return defaultBrowserSession;
    }

    // Try to perform a simple operation to check if the session is still valid
    try {
      await defaultBrowserSession.page.evaluate(() => document.title);
      return defaultBrowserSession;
    } catch (error) {
      // If we get an error indicating the session is invalid, reinitialize
      if (
        error instanceof Error &&
        (error.message.includes(
          "Target page, context or browser has been closed"
        ) ||
          error.message.includes("Session expired") ||
          error.message.includes("context destroyed") ||
          error.message.includes("Protocol error") ||
          error.message.includes("detached") ||
          error.message.includes("Attempted to use detached Frame"))
      ) {
        // Force cleanup of all sessions
        try {
          // Try to close the session if it's still accessible
          if (defaultBrowserSession) {
            try {
              await defaultBrowserSession.browser.close();
            } catch (e) {
              // Ignore errors when closing an already closed browser
            }
          }
          // Clean up all existing browser sessions
          for (const [id, sessionObj] of browsers.entries()) {
            try {
              await sessionObj.browser.close();
            } catch {
              // Ignore errors when closing
            }
            browsers.delete(id);
          }
        } catch {
          // Continue with reset even if cleanup fails
        }

        // Reset state
        browsers.clear();
        defaultBrowserSession = null;

        // Create a completely new session with delay to allow system to clean up
        await new Promise((resolve) => setTimeout(resolve, 1000));
        defaultBrowserSession = await createNewBrowserSession(sessionId);
        return defaultBrowserSession;
      }
      throw error; // Re-throw if it's a different type of error
    }
  } catch (error) {
    // If we still have a detached frame error after the first attempt, try a more aggressive approach
    if (
      error instanceof Error &&
      (error.message.includes("detached") ||
      error.message.includes("Attempted to use detached Frame"))
    ) {
      try {
        // Force cleanup
        browsers.clear();
        defaultBrowserSession = null;

        // Wait a bit longer to ensure resources are released
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Create a completely fresh connection
        defaultBrowserSession = await createNewBrowserSession(
          `fresh_${Date.now()}`
        );
        return defaultBrowserSession;
      } catch (retryError) {
        throw retryError;
      }
    }
    throw error;
  }
}

// 3. Helper Functions
async function createNewBrowserSession(sessionId: string) {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  });
  const browser = await puppeteer.connect({
    browserWSEndpoint: session.connectUrl,
  });

  const page = (await browser.pages())[0];
  browsers.set(sessionId, { browser, page });

  return { browser, page };
}

// 4. Tool Definitions
const TOOLS: Tool[] = [
  {
    name: "browserbase_create_session",
    description: "Create a new cloud browser session using Browserbase",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browserbase_navigate",
    description: "Navigate to a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
  },
  {
    name: "browserbase_screenshot",
    description: "Takes a screenshot of the current page. Use this tool to learn where you are on the page when controlling the browser with Stagehand. Only use this tool when the other tools are not sufficient to get the information you need.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browserbase_click",
    description: "Click an element on the page",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for element to click",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browserbase_fill",
    description: "Fill out an input field",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for input field",
        },
        value: { type: "string", description: "Value to fill" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "browserbase_get_text",
    description: "Extract all text content from the current page",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// 5. Tool Handler Implementation
async function handleToolCall(
  name: string,
  args: any
): Promise<CallToolResult> {
  try {
    let session: { browser: Browser; page: Page } | undefined;

    // For tools that don't need a session, skip session check
    if (!["browserbase_create_session"].includes(name)) {
      // Check if a specific session ID is requested
      if (args.sessionId && args.sessionId !== sessionId) {
        // Check if the requested session exists
        if (!browsers.has(args.sessionId)) {
          return {
            content: [
              {
                type: "text",
                text: `Session with ID '${args.sessionId}' does not exist. Please create a session first.`,
              },
            ],
            isError: true,
          };
        }
        // Use the specified session
        session = browsers.get(args.sessionId);
      } else {
        // Use or create the default session
        session = await ensureBrowserSession();
      }
    }

    switch (name) {
      case "browserbase_create_session":
        try {
          // Check if session already exists
          if (browsers.has(args.sessionId)) {
            return {
              content: [
                {
                  type: "text",
                  text: "Session already exists",
                },
              ],
              isError: false,
            };
          }
          await createNewBrowserSession(args.sessionId);
          return {
            content: [
              {
                type: "text",
                text: "Created new browser session",
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create browser session: ${
                  (error as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }
      case "browserbase_navigate":
        await session!.page.goto(args.url);
        return {
          content: [
            {
              type: "text",
              text: `Navigated to ${args.url}`,
            },
          ],
          isError: false,
        };

      case "browserbase_screenshot": {
        
        const screenshot = await session!.page.screenshot({
          encoding: "base64",
          fullPage: false,

        });

        if (!screenshot) {
          return {
            content: [
              {
                type: "text",
                text: "Screenshot failed",
              },
            ],
            isError: true,
          };
        }

        screenshots.set(args.name, screenshot as string);
        server.notification({
          method: "notifications/resources/list_changed",
        });

        return {
          content: [
            {
              type: "text",
              text: `Screenshot taken`,
            } as TextContent,
            {
              type: "image",
              data: screenshot,
              mimeType: "image/png",
            } as ImageContent,
          ],
          isError: false,
        };
      }

      case "browserbase_click":
        try {
          await session!.page.click(args.selector);
          return {
            content: [
              {
                type: "text",
                text: `Clicked: ${args.selector}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to click ${args.selector}: ${
                  (error as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }

      case "browserbase_fill":
        try {
          await session!.page.waitForSelector(args.selector);
          await session!.page.type(args.selector, args.value);
          return {
            
              content: [
                {
                  type: "text",
                  text: `Filled ${args.selector} with: ${args.value}`,
                },
              ],
              isError: false,
            
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to fill ${args.selector}: ${
                  (error as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }

      case "browserbase_get_json":
        try {
          const result = await session!.page.evaluate((selector) => {
            // Helper function to find JSON in text
            function extractJSON(text: string) {
              const jsonObjects = [];
              let braceCount = 0;
              let start = -1;

              for (let i = 0; i < text.length; i++) {
                if (text[i] === "{") {
                  if (braceCount === 0) start = i;
                  braceCount++;
                } else if (text[i] === "}") {
                  braceCount--;
                  if (braceCount === 0 && start !== -1) {
                    try {
                      const jsonStr = text.slice(start, i + 1);
                      const parsed = JSON.parse(jsonStr);
                      jsonObjects.push(parsed);
                    } catch (e) {
                      // Invalid JSON, continue searching
                    }
                  }
                }
              }
              return jsonObjects;
            }

            // Get all text content based on selector or full page
            const elements = selector
              ? Array.from(document.querySelectorAll(selector))
              : [document.body];

            const results = {
              // Look for JSON in text content
              textContent: elements.flatMap((el) =>
                extractJSON(el.textContent || "")
              ),

              // Look for JSON in script tags
              scriptTags: Array.from(
                document.getElementsByTagName("script")
              ).flatMap((script) => {
                try {
                  if (script.type === "application/json") {
                    return [JSON.parse(script.textContent || "")];
                  }
                  return extractJSON(script.textContent || "");
                } catch (e) {
                  return [];
                }
              }),

              // Look for JSON in meta tags
              metaTags: Array.from(document.getElementsByTagName("meta")).flatMap(
                (meta) => {
                  try {
                    const content = meta.getAttribute("content") || "";
                    return extractJSON(content);
                  } catch (e) {
                    return [];
                  }
                }
              ),

              // Look for JSON-LD
              jsonLd: Array.from(
                document.querySelectorAll('script[type="application/ld+json"]')
              ).flatMap((script) => {
                try {
                  return [JSON.parse(script.textContent || "")];
                } catch (e) {
                  return [];
                }
              }),
            };

            return results;
          }, args.selector);

          return {
            content: [
              {
                type: "text",
                text: `Found JSON content:\n${JSON.stringify(result, null, 2)}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to extract JSON: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }

        case "browserbase_get_text": {
          try {
            const bodyText = await session!.page.evaluate(() => document.body.innerText);
            const content = bodyText
              .split('\n')
              .map(line => line.trim())
              .filter(line => {
                if (!line) return false;
  
                if (
                    (line.includes('{') && line.includes('}')) ||         
                    line.includes('@keyframes') ||                         // Remove CSS animations
                    line.match(/^\.[a-zA-Z0-9_-]+\s*{/) ||               // Remove CSS lines starting with .className {
                    line.match(/^[a-zA-Z-]+:[a-zA-Z0-9%\s\(\)\.,-]+;$/)  // Remove lines like "color: blue;" or "margin: 10px;"
                  ) {
                  return false;
                }
                return true;
              })
              .map(line => {
                return line.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => 
                  String.fromCharCode(parseInt(hex, 16))
                );
              });
  
            return {
              content: [
                {
                  type: "text",
                  text: `Extracted content:\n${content.join('\n')}`,
                },
              ],
              isError: false,
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to extract content: ${(error as Error).message}`,
                },
              ],
              isError: true,
            };
          }
        }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to handle tool call: ${errorMsg}`
    );
    return {
      content: [
        {
          type: "text",
          text: `Failed to handle tool call: ${errorMsg}`,
        },
      ],
      isError: true,
    };
  }
}

// 6. Server Setup and Configuration
const server = new Server(
  {
    name: "example-servers/browserbase",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// 7. Request Handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    ...Array.from(screenshots.keys()).map((name) => ({
      uri: `screenshot://${name}`,
      mimeType: "image/png",
      name: `Screenshot: ${name}`,
    })),
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();


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
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {})
);

// 8. Server Initialization
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);