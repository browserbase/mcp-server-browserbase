#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ImageContent,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import {
  chromium,
  Browser,
  Page,
  errors as PlaywrightErrors,
} from "playwright-core";
import { Browserbase } from "@browserbasehq/sdk";
// import { TOOLS } from "./tools/definitions.js";
// import { handleToolCall } from "./tools/tabs.js";
import { setServerInstance } from "./tools/handlers.js";
import { handleListResources, handleReadResource } from "./resources/handlers.js";
import { closeAllSessions, setConfig } from "./sessionManager.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Config } from "../config.js";

// Import tool module factory functions (using default imports)
import navigate from "./tools/navigate.js"; 
import snapshot from "./tools/snapshot.js"; // Bundles snapshot, screenshot, click, type
import keyboard from "./tools/keyboard.js";
import getText from "./tools/getText.js";
import session from "./tools/session.js";
import common from "./tools/common.js";
// Import placeholder factories
import drag from "./tools/drag.js";
import hover from "./tools/hover.js";
import selectOption from "./tools/selectOption.js";

// Import package.json for version (adjust path if needed)
// Note: Using require for JSON might be needed depending on tsconfig module resolution
// import packageJSON from '../package.json' assert { type: 'json' }; 
// Alternatively, define version manually for now if import causes issues
const serverVersion = "0.5.1"; // Manually set from package.json

async function main() {
    // Load configuration
    const config = resolveConfig();

    // --- Assemble the list of tools --- 
    // Call the factory functions to get the tool arrays
    // Rename to snapshotTools to reflect the interaction model
    const snapshotTools: Tool<any>[] = [
        ...common(true),
        ...keyboard(true),
        ...navigate(true),
        ...snapshot(true),
        ...getText(true),
        ...session(true),
    ];
    
    // TODO: Filter tools based on config.capabilities if needed
    const toolsToUse = snapshotTools; 

    // --- Create Server Instance using Factory --- 
    const server = createServer(
        { 
            name: "Browserbase",
            version: serverVersion,
            tools: toolsToUse 
        },
        config
    );

// 3. Helper Functions
async function createNewBrowserSession(
  newSessionId: string // Removed asterisks
): Promise<{ browser: Browser; page: Page }> {
  console.error(`Creating new browser session with ID: ${newSessionId}`);
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });

  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    proxies: true, // You might want to make this configurable
  });
  console.error("Browserbase session created:", session.id);

  // const browser = await chromium.connect({ // Use playwright-core's chromium.connect
  // wsEndpoint: session.connectUrl,
  // timeout: 60000, // Increase connection timeout
  // });
  const browser = await chromium.connectOverCDP(session.connectUrl);
  console.error("Connected to Playwright via CDP.");

  // Handle unexpected disconnects
  browser.on("disconnected", () => {
    console.warn(
      `Browser disconnected unexpectedly for session ID: ${newSessionId}`
    );
    browsers.delete(newSessionId);
    // If the disconnected browser was the default one, clear the global reference
    if (defaultBrowserSession && defaultBrowserSession.browser === browser) {
      console.warn("Default browser session disconnected.");
      defaultBrowserSession = null;
    }
  });

  // Use the first context and page, assuming Browserbase provides one
  // If Browserbase session starts with no pages, create one.
  let context = browser.contexts()[0];
  if (!context) {
    console.error("No existing context found, creating new context.");
    context = await browser.newContext();
  }
  let page = context.pages()[0];
  if (!page) {
    console.error("No existing page found in context, creating new page.");
    page = await context.newPage();
  }
  console.error(`Using page: ${page.url()}`);
  // Store the session
  browsers.set(newSessionId, { browser, page });
  console.error(`Session ${newSessionId} stored.`);
  return { browser, page };
}

// 4. Tool Definitions
// Renamed tools start with browser_* for MCP standard where applicable.
// Kept browserbase_* for custom/utility functions.
const TOOLS: Tool[] = [
  {
    // Kept as browserbase_* as it's specific to this multi-session implementation
    name: "browserbase_create_session",
    description: "Create a new cloud browser session using Browserbase",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description:
            "A unique ID for the session (optional, uses a generated ID if not provided)",
        },
      },
      required: [],
    },
  },
  {
    // Renamed from browserbase_navigate
    name: "browserbase_navigate",
    description: "Navigate to a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["url"],
    },
  },
  {
    // NEW: Standard MCP snapshot tool
    name: "browserbase_snapshot",
    description:
      "Capture accessibility snapshot of the current page. Used to get 'ref' values for other actions.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: [],
    },
  },
  {
    // Renamed from browserbase_take_screenshot and schema updated
    name: "browserbase_take_screenshot",
    description:
      "Take a screenshot of the current page or element. Use browser_snapshot for actions.",
    inputSchema: {
      type: "object",
      properties: {
        raw: {
          type: "boolean",
          description:
            "Whether to return without compression (PNG format). Default false (JPEG).",
          default: false,
        },
        element: {
          type: "string",
          description:
            "Human-readable element description (requires ref). If omitted, screenshots viewport.",
        },
        ref: {
          type: "string",
          description:
            "Exact target element reference from browser_snapshot (requires element). If omitted, screenshots viewport.",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: [], // All args are optional or have defaults
    },
  },
  {
    // Renamed from browserbase_click (still uses selector internally for now)
    name: "browserbase_click",
    description:
      "Click an element on the page (currently uses selector, not snapshot ref).",
    inputSchema: {
      type: "object",
      properties: {
        // TODO: Change to element/ref when ref handling is implemented
        selector: {
          type: "string",
          description:
            "CSS or Playwright selector for element to click (Temporary - should use element/ref)",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["selector"], // Should be element/ref
    },
  },
  {
    // NEW: Standard MCP tool (placeholder)
    name: "browserbase_drag",
    description:
      "Perform drag and drop between two elements (requires snapshot ref - NOT IMPLEMENTED).",
    inputSchema: {
      type: "object",
      properties: {
        startElement: {
          type: "string",
          description:
            "Human-readable source element description (requires startRef).",
        },
        startRef: {
          type: "string",
          description: "Exact source element reference from browser_snapshot.",
        },
        endElement: {
          type: "string",
          description:
            "Human-readable target element description (requires endRef).",
        },
        endRef: {
          type: "string",
          description: "Exact target element reference from browser_snapshot.",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["startElement", "startRef", "endElement", "endRef"],
    },
  },
  {
    // NEW: Standard MCP tool (placeholder)
    name: "browserbase_hover",
    description:
      "Hover over element on page (requires snapshot ref - NOT IMPLEMENTED).",
    inputSchema: {
      type: "object",
      properties: {
        element: {
          type: "string",
          description: "Human-readable element description (requires ref).",
        },
        ref: {
          type: "string",
          description: "Exact target element reference from browser_snapshot.",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["element", "ref"],
    },
  },
  {
    // Renamed from browserbase_type, updated schema (still uses selector internally for now)
    name: "browserbase_type",
    description:
      "Type text into editable element (currently uses selector, not snapshot ref).",
    inputSchema: {
      type: "object",
      properties: {
        // TODO: Change to element/ref when ref handling is implemented
        selector: {
          type: "string",
          description:
            "CSS or Playwright selector for input field (Temporary - should use element/ref)",
        },
        text: { type: "string", description: "Text to type" },
        submit: {
          type: "boolean",
          description: "Whether to submit entered text (press Enter after)",
          default: false,
        },
        slowly: {
          type: "boolean",
          description:
            "Whether to type one character at a time. Default false.",
          default: false,
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["selector", "text"], // Should be element/ref + text
    },
  },
  {
    // NEW: Standard MCP tool (placeholder)
    name: "browserbase_select_option",
    description:
      "Select an option in a dropdown (requires snapshot ref - NOT IMPLEMENTED).",
    inputSchema: {
      type: "object",
      properties: {
        element: {
          type: "string",
          description: "Human-readable element description (requires ref).",
        },
        ref: {
          type: "string",
          description: "Exact target element reference from browser_snapshot.",
        },
        values: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of values to select in the dropdown (single or multiple).",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["element", "ref", "values"],
    },
  },
  {
    // Renamed from browserbase_press_key
    name: "browserbase_press_key",
    description:
      "Press a specific key (e.g., Enter, Tab) on a selected element or globally.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS or Playwright selector for the target element (optional, presses key globally if omitted)",
        },
        key: {
          type: "string",
          description:
            "The key to press (e.g., 'Enter', 'Tab', 'ArrowDown', 'a', 'Shift+A'). See Playwright key documentation.",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["key"], // Selector is optional
    },
  },
  {
    // Kept as browserbase_*, as it's a custom utility
    name: "browserbase_get_text",
    description:
      "Extract all text content from the current page or a specific element (uses selector).",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional CSS or Playwright selector to get text from a specific element",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: [], // selector is optional
    },
  },
  // Other standard tools like browser_tab_*, browser_navigate_back/forward etc.
  // could be added here if needed, potentially wrapping existing Playwright functions.
];

// 5. Tool Handler Implementation
async function handleToolCall(
  name: string, // Removed asterisks
  args: any // Removed asterisks
): Promise<CallToolResult> {
  console.error(
    `Handling tool call: ${name} with args: ${JSON.stringify(args)}`
  );
  try {
    let sessionObj: { browser: Browser; page: Page } | null = null; // Changed from undefined for clarity
    const targetSessionId = args.sessionId || sessionId; // Use provided sessionId or default

    // --- browserbase_create_session ---
    if (name === "browserbase_create_session") {
      // Allow user to specify an ID, otherwise generate one. Default is 'default'.
      const newSessionId = args.sessionId || `session_${Date.now()}`;
      try {
        // Check if session already exists
        if (browsers.has(newSessionId)) {
          console.warn(`Session '${newSessionId}' already exists.`);
          return {
            content: [
              {
                type: "text",
                text: `Session '${newSessionId}' already exists.`,
              },
            ],
            isError: false, // Not an error, just informing
          };
        }
        // Create the new session
        const createdSession = await createNewBrowserSession(newSessionId);
        // If creating the default session, update the global reference
        if (newSessionId === sessionId) {
          defaultBrowserSession = createdSession;
        }
        console.error(`Successfully created session: ${newSessionId}`);
        return {
          content: [
            {
              type: "text",
              text: `Created new browser session with ID: ${newSessionId}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        console.error(
          `Failed to create browser session '${newSessionId}': ${
            (error as Error).message
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Failed to create browser session '${newSessionId}': ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }

    // --- For other tools, ensure session exists ---
    console.error(`Looking for session: ${targetSessionId}`);
    if (targetSessionId === sessionId) {
      // Requesting the default session, ensure it's valid
      console.error("Default session requested, ensuring validity...");
      sessionObj = await ensureBrowserSession(); // This handles creation/validation/recreation
    } else if (browsers.has(targetSessionId)) {
      // Requesting a specific, non-default session
      console.error(`Found specific session ${targetSessionId} in map.`);
      sessionObj = browsers.get(targetSessionId)!; // Get from map
      // Validate this specific session
      if (!sessionObj.browser.isConnected() || sessionObj.page.isClosed()) {
        console.warn(
          `Specific session ${targetSessionId} is disconnected or page closed. Attempting to recreate...`
        );
        try {
          await sessionObj.browser.close(); // Close defunct session
        } catch (e) {
          console.error(
            `Error closing defunct session ${targetSessionId}: ${
              (e as Error).message
            }`
          );
        }
        browsers.delete(targetSessionId); // Remove from map
        try {
          sessionObj = await createNewBrowserSession(targetSessionId); // Recreate with the same ID
          console.error(`Successfully recreated session ${targetSessionId}.`);
        } catch (recreateError) {
          console.error(
            `Failed to recreate session ${targetSessionId}: ${
              (recreateError as Error).message
            }`
          );
          return {
            content: [
              {
                type: "text",
                text: `Session '${targetSessionId}' is invalid and could not be recreated: ${
                  (recreateError as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }
      } else {
        // Perform a quick check to be sure
        try {
          await sessionObj.page.title();
          console.error(`Specific session ${targetSessionId} validated.`);
        } catch (validationError) {
          console.warn(
            `Validation check failed for session ${targetSessionId}: ${
              (validationError as Error).message
            }. Assuming invalid.`
          );
          // Handle like the disconnected case above
          try {
            await sessionObj.browser.close();
          } catch (e) {}
          browsers.delete(targetSessionId);
          return {
            content: [
              {
                type: "text",
                text: `Session '${targetSessionId}' failed validation check: ${
                  (validationError as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }
      }
    } else {
      // Requested a specific session ID that does not exist in the map
      console.error(`Session with ID '${targetSessionId}' does not exist.`);
      return {
        content: [
          {
            type: "text",
            text: `Session with ID '${targetSessionId}' does not exist. Please create it first using browserbase_create_session or use the default session.`,
          },
        ],
        isError: true,
      };
    }

    // If after all checks, sessionObj is still null, something fundamental went wrong
    if (!sessionObj) {
      console.error(
        `Could not obtain a valid browser session for ID: ${targetSessionId} after all checks.`
      );
      throw new Error(
        `Could not obtain a valid browser session for ID: ${targetSessionId}`
      );
    }

    // We have a sessionObj, destructure the page
    const { page } = sessionObj;

    // Final check: Ensure page is usable (might have closed between checks)
    if (page.isClosed()) {
      console.error(
        `Page for session ${targetSessionId} was closed right before use.`
      );
      // Attempt recovery specifically for the default session if it was the target
      if (targetSessionId === sessionId) {
        console.error("Attempting recovery of default session...");
        try {
          sessionObj = await ensureBrowserSession(); // Try to recover the default session
          if (!sessionObj || sessionObj.page.isClosed()) {
            throw new Error(
              `Default page is closed and could not be recovered.`
            );
          }
          // Use the newly recovered page
          const recoveredPage = sessionObj.page;
          // Continue with the recoveredPage for the switch statement
          // This logic needs careful handling, maybe re-run the switch with recoveredPage?
          // For simplicity, let's return an error for now, suggesting retry.
          return {
            content: [
              {
                type: "text",
                text: `Page for session ${targetSessionId} was closed. Recovery attempted. Please retry the operation.`,
              },
            ],
            isError: true,
          };
        } catch (recoveryError) {
          throw new Error(
            `Page for session ${targetSessionId} is closed and recovery failed: ${
              (recoveryError as Error).message
            }`
          );
        }
      } else {
        // For non-default sessions, less straightforward to recover automatically
        throw new Error(
          `Page for non-default session ${targetSessionId} is closed.`
        );
      }
    }

    // --- Execute Tool Logic ---
    switch (name) {
      // browserbase_create_session handled above

      // Renamed from browserbase_navigate
      case "browserbase_navigate":
        if (!args.url)
          return {
            content: [{ type: "text", text: "Missing required argument: url" }],
            isError: true,
          };
        console.error(`Navigating session ${targetSessionId} to ${args.url}`);
        await page.goto(args.url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        }); // Added waituntil and timeout
        console.error(`Navigation successful for session ${targetSessionId}.`);
        return {
          content: [
            {
              type: "text",
              text: `Navigated session ${targetSessionId} to ${args.url}`,
            },
          ],
          isError: false,
        };

      // NEW: Implement browser_snapshot
      case "browserbase_snapshot": {
        try {
          console.error(
            `Taking accessibility snapshot for session ${targetSessionId}`
          );
          // Options can be provided, e.g., { interestingOnly: false, root: page.locator('main').elementHandle() }
          const snapshot = await page.accessibility.snapshot({
            interestingOnly: false, // Get full tree
          });
          console.error(
            `Accessibility snapshot taken for session ${targetSessionId}.`
          );
          // Return the snapshot data, usually as stringified JSON in a text field
          return {
            content: [
              {
                type: "text",
                // TODO: Consider a more structured format if the client expects it
                text: JSON.stringify(snapshot, null, 2), // Pretty print JSON
              },
            ],
            isError: false,
          };
        } catch (error) {
          console.error(
            `Failed to take accessibility snapshot for session ${targetSessionId}: ${
              (error as Error).message
            }`
          );
          return {
            content: [
              {
                type: "text",
                text: `Failed to take accessibility snapshot: ${
                  (error as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }
      }

      // Renamed from browserbase_take_screenshot, added 'raw' handling
      case "browserbase_take_screenshot": {
        const screenshotName = `screenshot_${Date.now()}.png`; // Use default timestamp name
        const usePNG = args.raw === true; // Check the 'raw' argument
        const screenshotType = usePNG ? "png" : "jpeg";
        console.error(
          `Taking screenshot for session ${targetSessionId} as ${screenshotType} (element/ref ignored for now)`
        );
        // TODO: Implement element screenshot logic using args.element and args.ref when ref handling is added.
        if (args.element || args.ref) {
          console.warn(
            `Element/ref arguments provided to browserbase_take_screenshot, but element-specific screenshots are not yet implemented. Taking full page screenshot.`
          );
        }

        const screenshotBuffer = await page.screenshot({
          fullPage: false, // Configurable: false for viewport, true for full page
          type: screenshotType,
          timeout: 30000, // Add timeout
        });
        if (!screenshotBuffer || screenshotBuffer.length === 0) {
          console.error(
            `Screenshot failed for session ${targetSessionId} - buffer empty.`
          );
          return {
            content: [
              {
                type: "text",
                text: "Screenshot failed: Empty buffer returned.",
              },
            ],
            isError: true,
          };
        }
        const screenshotBase64 = screenshotBuffer.toString("base64");
        screenshots.set(screenshotName, screenshotBase64); // Store base64 data
        server.notification({ method: "notifications/resources/list_changed" }); // Notify client about new resource
        console.error(
          `Screenshot taken and saved in memory as '${screenshotName}' for session ${targetSessionId}.`
        );
        return {
          content: [
            {
              type: "text",
              text: `Screenshot taken for session ${targetSessionId} and saved as '${screenshotName}'`,
            } as TextContent,
            {
              type: "image",
              data: screenshotBase64,
              mimeType: usePNG ? "image/png" : "image/jpeg", // Use correct mime type
            } as ImageContent,
          ],
          isError: false,
        };
      }

      // Renamed from browserbase_click (selector logic unchanged for now)
      case "browserbase_click":
        if (!args.selector)
          return {
            content: [
              { type: "text", text: "Missing required argument: selector" },
            ],
            isError: true,
          };
        try {
          console.error(
            `Attempting to click '${args.selector}' in session ${targetSessionId}`
          );
          // Recommended: Wait for the element first with a reasonable timeout
          await page.waitForSelector(args.selector, {
            state: "visible",
            timeout: 15000,
          });
          await page.locator(args.selector).click({ timeout: 10000 }); // Use locator API with timeout
          console.error(
            `Clicked '${args.selector}' successfully in session ${targetSessionId}.`
          );
          return {
            content: [
              {
                type: "text",
                text: `Clicked element matching selector: ${args.selector} in session ${targetSessionId}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          console.error(
            `Failed to click ${args.selector} in session ${targetSessionId}: ${
              (error as Error).message
            }`
          );
          // Provide more context in the error message
          let errorMessage = `Failed to click element matching selector "${args.selector}" in session ${targetSessionId}.`;
          if (error instanceof PlaywrightErrors.TimeoutError) {
            errorMessage +=
              " Reason: Timeout waiting for element or click action.";
          } else if (
            error instanceof Error &&
            error.message.includes("strict mode violation")
          ) {
            errorMessage +=
              " Reason: Multiple elements matched the selector. Please provide a more specific selector.";
          } else {
            errorMessage += ` Reason: ${(error as Error).message}`;
          }
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
          };
        }

      // Renamed from browserbase_type, added submit/slowly handling (selector logic unchanged)
      case "browserbase_type":
        if (!args.selector)
          return {
            content: [
              { type: "text", text: "Missing required argument: selector" },
            ],
            isError: true,
          };
        if (typeof args.text !== "string")
          return {
            content: [
              {
                type: "text",
                text: "Missing or invalid required argument: text (must be a string)",
              },
            ],
            isError: true,
          };
        try {
          const textToType = args.text;
          const pressEnter = args.submit === true; // Check submit flag
          const typeSlowly = args.slowly === true; // Check slowly flag

          console.error(
            `Attempting to type into '${args.selector}' in session ${targetSessionId} (slowly: ${typeSlowly}, submit: ${pressEnter})`
          );
          await page.waitForSelector(args.selector, {
            state: "visible",
            timeout: 15000,
          });

          const locator = page.locator(args.selector);

          if (typeSlowly) {
            await locator.pressSequentially(textToType, {
              timeout: 10000 + textToType.length * 100, // Adjust timeout based on text length
              delay: 50, // Add small delay between keys
            });
          } else {
            await locator.fill(textToType, { timeout: 10000 });
          }

          if (pressEnter) {
            console.error(`Pressing Enter after typing into ${args.selector}`);
            await locator.press("Enter", { timeout: 5000 });
          }

          console.error(
            `Typed into '${args.selector}' successfully in session ${targetSessionId}.`
          );
          return {
            content: [
              {
                type: "text",
                text: `Typed into element matching selector ${
                  args.selector
                } in session ${targetSessionId}. ${
                  pressEnter ? "Enter pressed." : "Enter NOT pressed."
                }`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          console.error(
            `Failed to type into '${
              args.selector
            }' in session ${targetSessionId}: ${(error as Error).message}`
          );
          let errorMessage = `Failed to type into element matching selector "${args.selector}" in session ${targetSessionId}.`;
          if (error instanceof PlaywrightErrors.TimeoutError) {
            errorMessage +=
              " Reason: Timeout waiting for element or type action.";
          } else {
            errorMessage += ` Reason: ${(error as Error).message}`;
          }
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
          };
        }

      // Renamed from browserbase_press_key
      case "browserbase_press_key": {
        if (!args.key) {
          return {
            content: [{ type: "text", text: "Missing required argument: key" }],
            isError: true,
          };
        }
        try {
          const keyToPress = args.key;
          if (args.selector) {
            console.error(
              `Attempting to press key '${keyToPress}' on selector '${args.selector}' in session ${targetSessionId}`
            );
            // Ensure element exists and is interactable before pressing key
            await page.waitForSelector(args.selector, {
              state: "visible",
              timeout: 15000,
            });
            // page.press supports timeout
            await page.press(args.selector, keyToPress, { timeout: 5000 });
            console.error(
              `Pressed key '${keyToPress}' on '${args.selector}' successfully in session ${targetSessionId}.`
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Pressed key '${keyToPress}' on element matching selector: ${args.selector} in session ${targetSessionId}`,
                },
              ],
              isError: false,
            };
          } else {
            // Press key globally (no specific element target)
            console.error(
              `Attempting to press key '${keyToPress}' globally in session ${targetSessionId}`
            );
            // page.keyboard.press does NOT support timeout
            await page.keyboard.press(keyToPress);
            console.error(
              `Pressed key '${keyToPress}' globally successfully in session ${targetSessionId}.`
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Pressed key '${keyToPress}' globally in session ${targetSessionId}`,
                },
              ],
              isError: false,
            };
          }
        } catch (error) {
          console.error(
            `Failed to press key '${args.key}' ${
              args.selector ? "on selector " + args.selector : "globally"
            } in session ${targetSessionId}: ${(error as Error).message}`
          );
          let errorMessage = `Failed to press key "${args.key}" ${
            args.selector
              ? 'on element matching selector "' + args.selector + '"'
              : "globally"
          } in session ${targetSessionId}.`;
          if (error instanceof PlaywrightErrors.TimeoutError) {
            errorMessage +=
              " Reason: Timeout waiting for element or key press action.";
          } else {
            errorMessage += ` Reason: ${(error as Error).message}`;
          }
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
          };
        }
      }

      // Kept as browserbase_get_text
      case "browserbase_get_text": {
        try {
          console.error(
            `Getting text content from session ${targetSessionId} (selector: ${
              args.selector || "body"
            })`
          );
          let textContent: string;
          const targetLocator = args.selector
            ? page.locator(args.selector)
            : page.locator("body");
          // Wait for the target element/body to be present
          await targetLocator
            .first()
            .waitFor({ state: "attached", timeout: 15000 });
          if (args.selector) {
            // Get text from a specific element (or first match if multiple)
            // innerText() is generally preferred for user-visible text
            textContent = await targetLocator
              .first()
              .innerText({ timeout: 10000 });
          } else {
            // Get text from the entire body
            textContent = await targetLocator.innerText({ timeout: 10000 });
          }
          console.error(
            `Successfully retrieved raw text content from session ${targetSessionId}. Length: ${textContent.length}`
          );
          // Basic cleanup - same as index.ts for consistency, can be refined
          const cleanedContent = textContent
            .split("\n") // Split by newline
            .map((line) => line.trim()) // Trim whitespace
            .filter(
              (line) =>
                line &&
                !/\{.*\}/.test(line) &&
                !/@keyframes/.test(line) &&
                !/^[\.#]/.test(line)
            ) // Filter empty lines, basic CSS/JS blocks
            .join("\n"); // Rejoin with newlines
          console.error(
            `Cleaned text content length: ${cleanedContent.length}`
          );
          // Limit output size if necessary
          const MAX_TEXT_LENGTH = 5000; // Example limit
          const truncatedContent =
            cleanedContent.length > MAX_TEXT_LENGTH
              ? cleanedContent.substring(0, MAX_TEXT_LENGTH) + "... (truncated)"
              : cleanedContent;
          return {
            content: [
              {
                type: "text",
                text: `Extracted content from session ${targetSessionId}:
${truncatedContent}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          console.error(
            `Failed to extract content from session ${targetSessionId}: ${
              (error as Error).message
            }`
          );
          let errorMessage = `Failed to extract text content from session ${targetSessionId} (selector: ${
            args.selector || "body"
          }).`;
          if (error instanceof PlaywrightErrors.TimeoutError) {
            errorMessage +=
              " Reason: Timeout waiting for element or text extraction.";
          } else {
            errorMessage += ` Reason: ${(error as Error).message}`;
          }
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
          };
        }
      }

      // NEW: Placeholder implementations for snapshot-based tools
      case "browserbase_drag":
      case "browserbase_hover":
      case "browserbase_select_option": {
        const toolName = name; // Capture the tool name
        console.warn(
          `Tool '${toolName}' called, but it requires snapshot 'ref' handling which is not yet implemented.`
        );
        return {
          content: [
            {
              type: "text",
              text: `Tool '${toolName}' is not implemented. It requires handling the 'ref' from 'browserbase_snapshot'. Current implementation uses selectors where possible.`,
            },
          ],
          // Setting isError: false as it's a known limitation, not a runtime error
          isError: false,
        };
      }

      default:
        console.error(`Unknown tool requested: ${name}`);
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    // Catch errors from session acquisition or general tool handling
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Critical error handling tool call '${name}' with args ${JSON.stringify(
      args
    )}: ${errorMsg}
${(error as Error).stack}`);
    // Check if it's a disconnection error type that might be recoverable
    const isRecoverableError =
      error instanceof Error &&
      (error.message.includes("Target closed") ||
        error.message.includes("Browser has been closed") ||
        error.message.includes("connect ECONNREFUSED") ||
        error.message.includes("Page is closed") ||
        error.message.includes("Session does not exist")); // Might indicate session was cleaned up

    if (isRecoverableError) {
      console.error(
        "Potentially recoverable error detected, attempting session recovery..."
      );
      try {
        // Attempt to ensure the default session is okay.
        // This might not help if the error was with a specific session,
        // but it's a reasonable recovery attempt.
        await ensureBrowserSession();
        console.error("Session recovery attempt finished.");
        return {
          content: [
            {
              type: "text",
              text: `Tool call failed due to a session issue (${errorMsg}). Recovery attempted. Please retry the operation.`,
            },
          ],
          isError: true,
        };
      } catch (recoveryError) {
        console.error(
          `Session recovery attempt failed: ${(recoveryError as Error).message}`
        );
        return {
          content: [
            {
              type: "text",
              text: `Tool call failed (${errorMsg}) and session recovery also failed: ${
                (recoveryError as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }
    // If not a recoverable error, or recovery failed, return the original error
    return {
      content: [
        {
          type: "text",
          text: `Failed to handle tool call '${name}': ${errorMsg}`,
        },
      ],
      isError: true,
    };
  }
}

// 6. Server Setup and Configuration
const server = new Server(
  {
    name: "mcp-servers/playwright-browserbase", // Updated server name slightly
    version: "0.1.0",
    // Add other server metadata if needed
  },
  {
    capabilities: {
      resources: {
        // Enable resource listing/reading if screenshots are used
        list: true,
        read: true,
      },
      tools: {
        // Enable tool listing/calling
        list: true,
        call: true,
      },
      notifications: {
        // Enable notifications if needed (e.g., for screenshot updates)
        resources: {
          list_changed: true,
        },
      },
    },
  }
);

// 7. Request Handlers
// --- List Resources ---
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.error("Handling ListResources request.");
  const resourceList = Array.from(screenshots.keys()).map((name) => ({
    // Removed asterisks around name
    uri: `screenshot://${name}`,
    mimeType: "image/png",
    name: `Screenshot: ${name}`,
    // Optionally add size or timestamp if available/relevant
  }));
  console.error(`Returning ${resourceList.length} screenshot resources.`);
  return { resources: resourceList };
});

// --- Read Resource ---
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  // Removed asterisks around request
  const uri = request.params.uri.toString();
  console.error(`Handling ReadResource request for URI: ${uri}`);
  if (uri.startsWith("screenshot://")) {
    const name = uri.split("://")[1];
    const screenshotBase64 = screenshots.get(name); // Get base64 data
    if (screenshotBase64) {
      console.error(`Found screenshot resource: ${name}`);
      return {
        contents: [
          {
            uri,
            mimeType: "image/png",
            blob: screenshotBase64, // Send base64 data as blob
          },
        ],
      };
    } else {
      console.error(`Screenshot resource not found: ${name}`);
      throw new Error(`Resource not found: ${uri}`);
    }
  }
  console.error(`Resource URI format not recognized: ${uri}`);
  throw new Error(`Resource not found or format not supported: ${uri}`);
});

// --- List Tools ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("Handling ListTools request.");
  return { tools: TOOLS };
});

// --- Call Tool ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Removed asterisks around request
  console.error(`Handling CallTool request for tool: ${request.params.name}`);
  return handleToolCall(request.params.name, request.params.arguments ?? {}); // Removed asterisks around request
});

// // 8. Server Initialization
// async function runServer() {
//   // Removed double asterisks
//   try {
//     console.error("Initializing server transport...");
//     const transport = new StdioServerTransport();
//     console.error("Connecting server...");
//     await server.connect(transport);
//     console.error("Playwright MCP server connected via stdio and ready.");
//     // Optionally, try to pre-warm the default browser session
//     // console.error("Pre-warming default browser session...");
//     // await ensureBrowserSession();
//     // console.error("Default browser session pre-warmed.");
//   } catch (error) {
//     console.error(
//       `Failed to start or connect server: ${(error as Error).message}`
//     );
//     process.exit(1); // Exit if server fails to start
//   }
// }

// Graceful shutdown handling
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.error(`
Received ${signal}. Shutting down gracefully...`);
            try {
                await server.close(); 
            } catch (shutdownError) {
            }
          process.exit(0);
        });
});

<<<<<<< HEAD
    // --- Connect and Run Server --- 
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
    } catch (error) {
        process.exit(1);
    }
}

// Start the main function
main().catch((err) => {
    process.exit(1);
});

// Catch unhandled errors
process.on("uncaughtException", (err) => {
    process.exit(1);
});
=======
export async function createServer(config: Config): Promise<Server> {
  setConfig(config);

  // Server Setup and Configuration
  const server = new Server(
    {
      name: "mcp-servers/playwright-browserbase",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {
          list: true,
          read: true,
        },
        tools: {
          list: true,
          call: true,
        },
        notifications: {
          resources: {
            list_changed: true,
          },
        },
      },
    },
  );

  // Inject server instance into tool handler module (for notifications)
  setServerInstance(server);

  // --- Request Handlers Setup ---

  // List Resources
  server.setRequestHandler(ListResourcesRequestSchema, handleListResources);

  // Read Resource
  server.setRequestHandler(ReadResourceRequestSchema, handleReadResource);

  // List Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Handling ListTools request.");
    return { tools: TOOLS };
  });

  // Call Tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.error(`Handling CallTool request for tool: ${request.params.name}`);
    // Delegate the actual tool execution to the handler function
    return handleToolCall(request.params.name, request.params.arguments ?? {});
  });
  
  const oldClose = server.close.bind(server);

  server.close = async () => {
    await closeAllSessions();
    await oldClose();
  }

  return server;
}
// // Start the server
// runServer().catch((err: Error) => {
//   // Removed asterisks around err, removed double asterisks around runServer
//   console.error("Server execution failed:", err); // Removed asterisks around err
//   process.exit(1);
// });
>>>>>>> 08c0ef8 (add sse flags)
