import { Stagehand } from "@browserbasehq/stagehand";
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getServerInstance, operationLogs } from "./logging.js";
import { screenshots } from "./resources.js";

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
    description: `Performs an action on a web page element. Accepts either a string description or a structured object.
      
      String format: Act actions should be as atomic and specific as possible, i.e. "Click the sign in button" or "Type 'hello' into the search input". 
      AVOID actions that are more than one step, i.e. "Order me pizza" or "Send an email to Paul asking him to call me".
      
      Object format: JSON-ified version of a Playwright action with properties: description, action, selector, arguments.
      Example: {"description": "Click the jobs link", "action": "click", "selector": "/html/body/div[1]/div[1]/a", "arguments": []}`,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          oneOf: [
            {
              type: "string",
              description: `The action to perform. Should be as atomic and specific as possible, 
              i.e. 'Click the sign in button' or 'Type 'hello' into the search input'. AVOID actions that are more than one 
              step, i.e. 'Order me pizza' or 'Send an email to Paul asking him to call me'. The instruction should be just as specific as possible, 
              and have a strong correlation to the text on the page. If unsure, use observe before using act."`
            },
            {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description: "Description of the action to perform"
                },
                action: {
                  type: "string",
                  description: "The Playwright action type (e.g., 'click', 'type', 'hover')"
                },
                selector: {
                  type: "string",
                  description: "The CSS selector or XPath to target the element"
                },
                arguments: {
                  type: "array",
                  description: "Additional arguments for the action",
                  items: {}
                }
              },
              required: ["description", "action", "selector", "arguments"],
              description: "JSON-ified version of a Playwright action"
            }
          ]
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
        let actionDescription: string;
        let parsedAction: any = args.action;

        // Try to parse string as JSON if it looks like JSON
        if (typeof args.action === "string" && args.action.trim().startsWith("{")) {
          try {
            parsedAction = JSON.parse(args.action);
          } catch (e) {
            // If parsing fails, treat as regular string
            parsedAction = args.action;
          }
        }

        if (typeof parsedAction === "string") {
          actionDescription = parsedAction;
          await stagehand.page.act({
            action: parsedAction,
            variables: args.variables,
          });
        } else {
          actionDescription = `${parsedAction.description} (${parsedAction.action} on ${parsedAction.selector})`;
          await stagehand.page.act(parsedAction);
        }

        return {
          content: [
            {
              type: "text",
              text: `Action performed (${typeof parsedAction === "string" ? "string" : "object"}): ${actionDescription}`,
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
