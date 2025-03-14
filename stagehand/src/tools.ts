import { Stagehand } from "@browserbasehq/stagehand";
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { AnyZodObject } from "zod";
import { jsonSchemaToZod } from "./utils.js";
import { formatLogResponse, log, operationLogs } from "./logging.js";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createTask, completeTask, failTask, TaskStatus, updateTask } from "./resources.js";

// Get the directory name for the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define the Stagehand tools
export const TOOLS: Tool[] = [
  {
    name: "stagehand_navigate",
    description: "Navigate to a URL in the browser. Only use this tool with URLs you're confident will work and stay up to date. Otheriwse use https://google.com as the starting point",
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
        action: { type: "string", description: `The action to perform. Should be as atomic and specific as possible, 
          i.e. 'Click the sign in button' or 'Type 'hello' into the search input'. AVOID actions that are more than one 
          step, i.e. 'Order me pizza' or 'Send an email to Paul asking him to call me'. The instruction should be just as specific as possible, 
          and have a strong correlation to the text on the page. If unsure, use observe before using act."` },
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
    description: `Extracts structured data from the web page based on an instruction and a JSON schema (Zod schema). Extract works best for extracting TEXT in a structured format.`,
    inputSchema: {
      type: "object",
      description: `**Instructions for providing the schema:**
  
  - The \`schema\` should be a valid JSON Schema (Zod) object that defines the structure of the data to extract.
  - Use standard JSON Schema syntax.
  - The server will convert the JSON Schema to a Zod schema internally.
  
  **Example schemas:**
  
  1. **Extracting a list of search result titles:**
  
  \`\`\`json
  {
    "type": "object",
    "properties": {
      "searchResults": {
        "type": "array",
        "items": {
          "type": "string",
          "description": "Title of a search result"
        }
      }
    },
    "required": ["searchResults"]
  }
  \`\`\`
  
  2. **Extracting product details:**
  
  \`\`\`json
  {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "price": { "type": "string" },
      "rating": { "type": "number" },
      "reviews": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["name", "price", "rating", "reviews"]
  }
  \`\`\`
  
  **Example usage:**
  
  - **Instruction**: "Extract the titles and URLs of the main search results, excluding any ads."
  - **Schema**:
    \`\`\`json
    {
      "type": "object",
      "properties": {
        "results": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string", "description": "The title of the search result" },
              "url": { "type": "string", "description": "The URL of the search result" }
            },
            "required": ["title", "url"]
          }
        }
      },
      "required": ["results"]
    }
    \`\`\`
  
  **Note:**
  
  - Ensure the schema is valid JSON.
  - Use standard JSON Schema types like \`string\`, \`number\`, \`array\`, \`object\`, etc.
  - You can add descriptions to help clarify the expected data.
  `,
      properties: {
        instruction: {
          type: "string",
          description:
            "Clear instruction for what data to extract from the page",
        },
        schema: {
          type: "object",
          description:
            "A JSON Schema object defining the structure of data to extract",
          additionalProperties: true,
        },
      },
      required: ["instruction", "schema"],
    },
  },
  {
    name: "stagehand_observe",
    description: "Observes elements on the web page. Use this tool to observe elements that you can later use in an action. Use observe instead of extract when dealing with actionable (interactable) elements rather than text. More often than not, you'll want to use extract instead of observe when dealing with scraping or extracting structured text.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "Instruction for observation (e.g., 'find the login button'). This instruction must be extremely specific.",
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the current page. Use this tool to learn where you are on the page when controlling the browser with Stagehand.",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: { 
          type: "boolean", 
          description: "Whether to take a screenshot of the full page (true) or just the visible viewport (false). Default is false." 
        },
        path: {
          type: "string",
          description: "Optional. Custom file path where the screenshot should be saved. If not provided, a default path will be used."
        }
      }
    },
  },
  {
    name: "check_task_status",
    description: "Check the status of a long-running task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { 
          type: "string", 
          description: "The ID of the task to check" 
        }
      },
      required: ["taskId"]
    },
  },
];

// Handle tool calls
export async function handleToolCall(
  name: string,
  args: any,
  stagehand: Stagehand
): Promise<CallToolResult> {
  
  // For potentially long-running operations, create a task and return immediately
  if (name === 'stagehand_navigate' || name === 'stagehand_extract' || name === 'stagehand_act') {
    const task = createTask(name);
    
    // Start the operation in the background
    (async () => {
      try {
        updateTask(task.id, { status: TaskStatus.RUNNING });
        
        let result;
        switch (name) {
          case "stagehand_navigate":
            await stagehand.page.goto(args.url);
            result = `Navigated to: ${args.url}`;
            break;
            
          case "stagehand_act":
            await stagehand.page.act({
              action: args.action,
              variables: args.variables,
              slowDomBasedAct: false,
            });
            result = `Action performed: ${args.action}`;
            break;
            
          case "stagehand_extract":
            const zodSchema = jsonSchemaToZod(args.schema) as AnyZodObject;
            const extractResult = await stagehand.page.extract({
              instruction: args.instruction,
              schema: zodSchema,
              useTextExtract: true,
            });
            result = extractResult;
            break;
        }
        
        // Mark task as completed with result
        completeTask(task.id, result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        failTask(task.id, errorMsg);
      }
    })();
    
    // Return immediate response with task ID
    return {
      content: [
        {
          type: "text",
          text: `Task started with ID: ${task.id}. You can check the status using the check_task_status tool.`,
        },
      ],
      isError: false,
    };
  }
  
  // Handle the check_task_status tool
  if (name === "check_task_status") {
    try {
      const taskId = args.taskId;
      
      // Import within function to avoid circular dependency
      const { getTask } = await import('./resources.js');
      const task = getTask(taskId);
      
      if (!task) {
        return {
          content: [
            {
              type: "text",
              text: `Task with ID ${taskId} not found`,
            },
          ],
          isError: true,
        };
      }
      
      // Return different responses based on task status
      switch (task.status) {
        case TaskStatus.PENDING:
        case TaskStatus.RUNNING:
          return {
            content: [
              {
                type: "text",
                text: `Task ${taskId} is ${task.status}${task.progress ? ` (${task.progress}% complete)` : ''}`,
              },
            ],
            isError: false,
          };
          
        case TaskStatus.COMPLETED:
          return {
            content: [
              {
                type: "text",
                text: `Task ${taskId} is completed`,
              },
              {
                type: "text",
                text: `Result: ${JSON.stringify(task.result)}`,
              },
            ],
            isError: false,
          };
          
        case TaskStatus.FAILED:
          return {
            content: [
              {
                type: "text",
                text: `Task ${taskId} failed: ${task.error}`,
              },
            ],
            isError: true,
          };
          
        case TaskStatus.CANCELLED:
          return {
            content: [
              {
                type: "text",
                text: `Task ${taskId} was cancelled`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to check task status: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  // Fall back to the original synchronous handling for other tools
  switch (name) {
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
              text: `Operation logs:\n${formatLogResponse(operationLogs)}`,
            },
          ],
          isError: true,
        };
      }

    case "screenshot":
      try {
        const fullPage = args.fullPage === true;
        
        // Create a screenshots directory next to the logs directory
        const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');
        if (!fs.existsSync(SCREENSHOTS_DIR)) {
          fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        }
        
        // Generate a filename based on timestamp if path not provided
        const screenshotPath = args.path || path.join(SCREENSHOTS_DIR, `screenshot-${new Date().toISOString().replace(/:/g, '-')}.png`);
        
        // If a custom path is provided, ensure its directory exists
        if (args.path) {
          const customDir = path.dirname(screenshotPath);
          if (!fs.existsSync(customDir)) {
            fs.mkdirSync(customDir, { recursive: true });
          }
        }
        
        // Take the screenshot
        // making fullpage false temporarily
        await stagehand.page.screenshot({ path: screenshotPath, fullPage: false });
        
        return {
          content: [
            {
              type: "text",
              text: `Screenshot taken and saved to: ${screenshotPath}`,
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
              text: `Operation logs:\n${formatLogResponse(operationLogs)}`,
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
            text: `Operation logs:\n${formatLogResponse(operationLogs)}`,
          },
        ],
        isError: true,
      };
  }
} 