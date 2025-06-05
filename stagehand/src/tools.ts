import { Stagehand } from "@browserbasehq/stagehand";
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getServerInstance, operationLogs } from "./logging.js";
import { screenshots } from "./resources.js";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the Stagehand tools
export const TOOLS: Tool[] = [
  {
    name: "stagehand_navigate",
    description:
      "Navigate to a URL in the browser. Only use this tool with URLs you're confident will work and stay up to date. Otheriwse use https://google.com as the starting point",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to navigate to" },
      },
      required: ["url"],
    },
  },
  {
    name: "stagehand_act",
    description: `Performs an action on a web page element. Act actions should be as atomic and 
      specific as possible, i.e. "Click the sign in button" or "Type 'hello' into the search input". 
      AVOID actions that are more than one step, i.e. "Order me pizza" or "Send an email to Paul 
      asking him to call me". `,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: `The action to perform. Should be as atomic and specific as possible, 
          i.e. 'Click the sign in button' or 'Type 'hello' into the search input'. AVOID actions that are more than one 
          step, i.e. 'Order me pizza' or 'Send an email to Paul asking him to call me'. The instruction should be just as specific as possible, 
          and have a strong correlation to the text on the page. If unsure, use observe before using act."`,
        },
        variables: {
          type: "object",
          additionalProperties: true,
          description: `Variables used in the action template. ONLY use variables if you're dealing 
            with sensitive data or dynamic content. For example, if you're logging in to a website, 
            you can use a variable for the password. When using variables, you MUST have the variable
            key in the action template. For example: {"action": "Fill in the password", "variables": {"password": "123456"}}`,
        },
      },
      required: ["action"],
    },
  },
  {
    name: "stagehand_extract",
    description: `Extracts all of the text from the current page.`,
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "stagehand_observe",
    description:
      "Observes elements on the web page. Use this tool to observe elements that you can later use in an action. Use observe instead of extract when dealing with actionable (interactable) elements rather than text. More often than not, you'll want to use extract instead of observe when dealing with scraping or extracting structured text.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description:
            "Instruction for observation (e.g., 'find the login button'). This instruction must be extremely specific.",
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "stagehand_get_html",
    description:
      "Captures the raw HTML of the current webpage. Use this tool when you need to analyze the page structure or extract specific HTML elements. This tool returns a URL that you need to download to access the HTML content.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional selector to get HTML for a specific element. Both CSS and XPath selectors are supported. If omitted, returns the entire page HTML.",
        },
      },
    },
  },
  {
    name: "screenshot",
    description:
      "Takes a screenshot of the current page. Use this tool to learn where you are on the page when controlling the browser with Stagehand. Only use this tool when the other tools are not sufficient to get the information you need.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Handle tool calls
export async function handleToolCall(
  name: string,
  args: any,
  stagehand: Stagehand
): Promise<CallToolResult> {
  switch (name) {
    case "stagehand_navigate":
      try {
        await stagehand.page.goto(args.url);
        return {
          content: [
            {
              type: "text",
              text: `Navigated to: ${args.url}`,
            },
            {
              type: "text",
              text: `View the live session here: https://browserbase.com/sessions/${stagehand.browserbaseSessionID}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to navigate: ${errorMsg}`,
            },
            {
              type: "text",
              text: `Operation logs:\n${operationLogs.join("\n")}`,
            },
          ],
          isError: true,
        };
      }

    case "stagehand_act":
      try {
        await stagehand.page.act({
          action: args.action,
          variables: args.variables,
        });
        return {
          content: [
            {
              type: "text",
              text: `Action performed: ${args.action}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to perform action: ${errorMsg}`,
            },
            {
              type: "text",
              text: `Operation logs:\n${operationLogs.join("\n")}`,
            },
          ],
          isError: true,
        };
      }

    case "stagehand_extract": {
      try {
        const bodyText = await stagehand.page.evaluate(
          () => document.body.innerText
        );
        const content = bodyText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => {
            if (!line) return false;

            if (
              (line.includes("{") && line.includes("}")) ||
              line.includes("@keyframes") || // Remove CSS animations
              line.match(/^\.[a-zA-Z0-9_-]+\s*{/) || // Remove CSS lines starting with .className {
              line.match(/^[a-zA-Z-]+:[a-zA-Z0-9%\s\(\)\.,-]+;$/) // Remove lines like "color: blue;" or "margin: 10px;"
            ) {
              return false;
            }
            return true;
          })
          .map((line) => {
            return line.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
              String.fromCharCode(parseInt(hex, 16))
            );
          });

        return {
          content: [
            {
              type: "text",
              text: `Extracted content:\n${content.join("\n")}`,
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

    case "stagehand_observe":
      try {
        const observations = await stagehand.page.observe({
          instruction: args.instruction,
          returnAction: false,
        });
        return {
          content: [
            {
              type: "text",
              text: `Observations: ${JSON.stringify(observations)}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to observe: ${errorMsg}`,
            },
            {
              type: "text",
              text: `Operation logs:\n${operationLogs.join("\n")}`,
            },
          ],
          isError: true,
        };
      }

    case "stagehand_get_html":
      try {
        const html = await stagehand.page.evaluate((selector) => {
          if (selector) {
            try {
              // Check if the selector is an XPath selector
              if (
                selector.startsWith("/") ||
                selector.startsWith("./") ||
                selector.startsWith("//")
              ) {
                // Handle XPath selector
                const result = document.evaluate(
                  selector,
                  document,
                  null,
                  XPathResult.FIRST_ORDERED_NODE_TYPE,
                  null
                );
                const element = result.singleNodeValue;
                if (!element || !(element instanceof Element)) {
                  return `<!DOCTYPE html>
<html>
<head><title>XPath Element Not Found</title></head>
<body>
<h1>XPath Element Not Found</h1>
<p>The XPath selector did not match any elements on the page.</p>
<h2>Details:</h2>
<ul>
  <li><strong>XPath Selector:</strong> ${selector}</li>
  <li><strong>Document Title:</strong> ${document.title}</li>
  <li><strong>Document URL:</strong> ${document.location.href}</li>
  <li><strong>Page Content Length:</strong> ${document.documentElement.outerHTML.length} characters</li>
</ul>
<h2>Suggestions:</h2>
<ul>
  <li>Check if the XPath selector is correct</li>
  <li>Verify that the element exists on the page</li>
  <li>Try using browser developer tools to test the XPath selector</li>
  <li>Consider using a CSS selector instead if possible</li>
</ul>
</body>
</html>`;
                }
                return element.outerHTML;
              } else {
                // Handle CSS selector
                const element = document.querySelector(selector);
                if (!element || !(element instanceof Element)) {
                  return `<!DOCTYPE html>
<html>
<head><title>CSS Element Not Found</title></head>
<body>
<h1>CSS Element Not Found</h1>
<p>The CSS selector did not match any elements on the page.</p>
<h2>Details:</h2>
<ul>
  <li><strong>CSS Selector:</strong> ${selector}</li>
  <li><strong>Document Title:</strong> ${document.title}</li>
  <li><strong>Document URL:</strong> ${document.location.href}</li>
  <li><strong>Page Content Length:</strong> ${
    document.documentElement.outerHTML.length
  } characters</li>
  <li><strong>Similar Elements:</strong> ${
    Array.from(document.querySelectorAll("*"))
      .filter(
        (el) =>
          el.tagName.toLowerCase() ===
          selector.split(/[.#\[\s>+~]/)[0].toLowerCase()
      )
      .slice(0, 5)
      .map(
        (el) =>
          `&lt;${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ""}${
            el.className ? ` class="${el.className}"` : ""
          }&gt;`
      )
      .join(", ") || "None found"
  }</li>
</ul>
<h2>Suggestions:</h2>
<ul>
  <li>Check if the CSS selector syntax is correct</li>
  <li>Verify that the element exists on the page</li>
  <li>Try using browser developer tools to test the CSS selector</li>
  <li>Consider using a simpler selector (e.g., by ID or a unique class)</li>
  <li>Check if the element is dynamically added to the page</li>
</ul>
</body>
</html>`;
                }
                return element.outerHTML;
              }
            } catch (err: unknown) {
              return `Selector error: ${
                err instanceof Error ? err.message : String(err)
              }. For XPath, use '//' or '/' prefix. For CSS, use standard selectors.`;
            }
          }
          return document.documentElement.outerHTML;
        }, args.selector || null);

        // Save HTML to a file in the tmp directory
        const fs = await import("fs/promises");
        const { randomBytes } = await import("crypto");
        const TMP_DIR = path.resolve(__dirname, "../tmp");
        await fs.mkdir(TMP_DIR, { recursive: true });
        const unique = `${Date.now()}-${randomBytes(6).toString("hex")}`;
        const filename = `stagehand-html-${unique}.html`;
        const filePath = path.join(TMP_DIR, filename);
        await fs.writeFile(filePath, html, "utf8");
        const port = process.env.STAGEHAND_HTTP_PORT || 8080;
        const url = `http://localhost:${port}/tmp/${filename}`;

        return {
          content: [
            {
              type: "text",
              text: `HTML saved to: ${url}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get HTML: ${errorMsg}`,
            },
            {
              type: "text",
              text: `Operation logs:\n${operationLogs.join("\n")}`,
            },
          ],
          isError: true,
        };
      }

    case "screenshot":
      try {
        const screenshotBuffer = await stagehand.page.screenshot({
          fullPage: false,
        });

        // Convert buffer to base64 string and store in memory
        const screenshotBase64 = screenshotBuffer.toString("base64");
        const name = `screenshot-${new Date()
          .toISOString()
          .replace(/:/g, "-")}`;
        screenshots.set(name, screenshotBase64);

        // Notify the client that the resources changed
        const serverInstance = getServerInstance();
        if (serverInstance) {
          serverInstance.notification({
            method: "notifications/resources/list_changed",
          });
        }

        return {
          content: [
            {
              type: "text",
              text: `Screenshot taken with name: ${name}`,
            },
            {
              type: "image",
              data: screenshotBase64,
              mimeType: "image/png",
            },
          ],
          isError: false,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to take screenshot: ${errorMsg}`,
            },
            {
              type: "text",
              text: `Operation logs:\n${operationLogs.join("\n")}`,
            },
          ],
          isError: true,
        };
      }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
          {
            type: "text",
            text: `Operation logs:\n${operationLogs.join("\n")}`,
          },
        ],
        isError: true,
      };
  }
}
