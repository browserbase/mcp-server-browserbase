import { z } from "zod";
import type {
  TextContent,
  ImageContent,
} from "@modelcontextprotocol/sdk/types.js";
import type { Locator, PageScreenshotOptions } from "playwright-core";

import { defineTool, type ToolResult,  } from "./tool.js";
import type { Context, ToolActionResult } from "../context.js"; 
import { PageSnapshot } from "../pageSnapshot.js"; 
import { outputFile } from "../config.js"; 

// --- Tool: Snapshot ---
const SnapshotInputSchema = z.object({});
type SnapshotInput = z.infer<typeof SnapshotInputSchema>;

const snapshot = defineTool<typeof SnapshotInputSchema>({
  capability: "core",
  schema: {
    name: "browserbase_snapshot",
    description:
      "Capture a new accessibility snapshot of the current page state. Use this if the page has changed to ensure subsequent actions use an up-to-date page representation.",
    inputSchema: SnapshotInputSchema,
  },

  handle: async (
    context: Context,
    params: SnapshotInput
  ): Promise<ToolResult> => {
    const action = async (): Promise<ToolActionResult> => {
      const content: (TextContent | ImageContent)[] = [
        { type: "text", text: "Accessibility snapshot captured." },
      ];
      return { content };
    };

    return {
      action,
      code: [`// Request accessibility snapshot`],
      captureSnapshot: true,
      waitForNetwork: false,
      resultOverride: {
        content: [{ type: "text", text: "Accessibility snapshot initiated." }],
      },
    };
  },
});

// --- Element Schema & Types ---
const elementSchema = z.object({
  element: z.string().describe("Human-readable element description"),
  ref: z
    .string()
    .describe("Exact target element reference from the page snapshot"),
});
type ElementInput = z.infer<typeof elementSchema>;

// --- Tool: Click (Adapted Handle, Example Action) ---
const click = defineTool({
  capability: "core",
  schema: {
    name: "browserbase_click",
    description: "Perform click on a web page using ref",
    inputSchema: elementSchema,
  },
  handle: async (
    context: Context,
    params: ElementInput
  ): Promise<ToolResult> => {
    // Get locator directly from snapshot
    const snapshot = context.snapshotOrDie();
    const locator = snapshot.refLocator(params.ref);

    const code = [
      `// Click ${params.element}`,
      // Use generateLocator for code string
      `// await page.${await generateLocator(locator)}.click();`,
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Use the locator directly for the action
        await locator.click({ force: true, timeout: 30000 }); // Increased timeout like logs
      } catch (actionError) {
        const errorMessage =
          actionError instanceof Error
            ? actionError.message
            : String(actionError);
        throw new Error(
          `Failed to click element '${params.element}'. Error: ${errorMessage}`
        );
      }
      return {
        content: [{ type: "text", text: `Clicked ${params.element}` }],
      };
    };

    return {
      code,
      action,
      captureSnapshot: true,
      waitForNetwork: true,
    };
  },
});

// --- Tool: Drag (Adapted Handle, Example Action) ---
const dragInputSchema = z.object({
  startElement: z.string().describe("Source element description"),
  startRef: z
    .string()
    .describe("Exact source element reference from the page snapshot"),
  endElement: z.string().describe("Target element description"),
  endRef: z
    .string()
    .describe("Exact target element reference from the page snapshot"),
});
type DragInput = z.infer<typeof dragInputSchema>;

const drag = defineTool<typeof dragInputSchema>({
  capability: "core",
  schema: {
    name: "browserbase_drag",
    description: "Perform drag and drop between two elements using ref.",
    inputSchema: dragInputSchema,
  },
  handle: async (context: Context, params: DragInput): Promise<ToolResult> => {
    // Get locators directly from snapshot
    const snapshot = context.snapshotOrDie();
    const startLocator = snapshot.refLocator(params.startRef);
    const endLocator = snapshot.refLocator(params.endRef);

    const code = [
      `// Drag ${params.startElement} to ${params.endElement}`,
      // Use generateLocator for code string
      `// await page.${await generateLocator(
        startLocator
      )}.dragTo(page.${await generateLocator(endLocator)});`,
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Use locators directly for the action
        await startLocator.dragTo(endLocator, { timeout: 5000 });
      } catch (dragError) {
        const errorMsg =
          dragError instanceof Error ? dragError.message : String(dragError);
        throw new Error(
          `Failed to drag '${params.startElement}' to '${params.endElement}'. Error: ${errorMsg}`
        );
      }
      return {
        content: [
          {
            type: "text",
            text: `Dragged ${params.startElement} to ${params.endElement}`,
          },
        ],
      };
    };

    return { action, code, captureSnapshot: true, waitForNetwork: true };
  },
});

// --- Tool: Hover (Adapted Handle, Example Action) ---
const hover = defineTool<typeof elementSchema>({
  capability: "core",
  schema: {
    name: "browserbase_hover",
    description: "Hover over element on page using ref.",
    inputSchema: elementSchema,
  },
  handle: async (
    context: Context,
    params: ElementInput
  ): Promise<ToolResult> => {
    // Get locator directly from snapshot
    const snapshot = context.snapshotOrDie();
    const locator = snapshot.refLocator(params.ref);

    const code = [
      `// Hover over ${params.element}`,
      // Use generateLocator for code string
      `// await page.${await generateLocator(locator)}.hover();`,
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Use locator directly for the action
        await locator.hover({ timeout: 5000 });
      } catch (hoverError) {
        const errorMsg =
          hoverError instanceof Error ? hoverError.message : String(hoverError);
        throw new Error(
          `Failed to hover over element '${params.element}'. Error: ${errorMsg}`
        );
      }
      return {
        content: [{ type: "text", text: `Hovered over: ${params.element}` }],
      };
    };

    return { action, code, captureSnapshot: true, waitForNetwork: true };
  },
});

// --- Tool: Type (Adapted Handle, Example Action) ---
const typeSchema = elementSchema.extend({
  text: z.string().describe("Text to type into the element"),
  submit: z
    .boolean()
    .optional()
    .describe("Whether to submit entered text (press Enter after)"),
  slowly: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to type one character at a time."),
});
type TypeInput = z.infer<typeof typeSchema>;

const type = defineTool<typeof typeSchema>({
  capability: "core",
  schema: {
    name: "browserbase_type",
    description: "Type text into editable element using ref.",
    inputSchema: typeSchema,
  },
  handle: async (context: Context, params: TypeInput): Promise<ToolResult> => {
    // Get locator directly from snapshot
    const snapshot = context.snapshotOrDie();
    const locator = snapshot.refLocator(params.ref);

    const code: string[] = [];
    const steps: (() => Promise<void>)[] = [];

    if (params.slowly) {
      code.push(
        `// Press "${params.text}" sequentially into "${params.element}"`
      );
      code.push(
        `// await page.${await generateLocator(
          locator
        )}.pressSequentially('${params.text.replace(/'/g, "\\'")}');`
      );
      steps.push(() =>
        locator.pressSequentially(params.text, { delay: 50 }) 
      );
    } else {
      code.push(`// Fill "${params.text}" into "${params.element}"`);
      code.push(
        `// await page.${await generateLocator(
          locator
        )}.fill('${params.text.replace(/'/g, "\\'")}');`
      );
      steps.push(async () => {
        await locator.waitFor({ state: "visible"});
        if (!(await locator.isEditable())) {
          throw new Error(
            `Element '${params.element}' was visible but not editable.`
          );
        }
        await locator.fill("", { force: true, timeout: 5000 }); // Force empty fill first
        await locator.fill(params.text, { force: true, timeout: 5000 }); // Force fill with text
      });
    }

    if (params.submit) {
      code.push(`// Submit text`);
      code.push(
        `// await page.${await generateLocator(locator)}.press('Enter');`
      );
      steps.push(() => locator.press("Enter", { timeout: 5000 }));
    }

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Execute the steps sequentially
        await steps.reduce((acc, step) => acc.then(step), Promise.resolve());
      } catch (typeError) {
        const errorMsg =
          typeError instanceof Error ? typeError.message : String(typeError);
        throw new Error(
          `Failed to type into or submit element '${params.element}'. Error: ${errorMsg}`
        );
      }
      return {
        content: [
          {
            type: "text",
            text: `Typed "${params.text}" into: ${params.element}${
              params.submit ? " and submitted" : ""
            }`,
          },
        ],
      };
    };

    return { action, code, captureSnapshot: true, waitForNetwork: true };
  },
});

// --- Tool: Select Option (Adapted Handle, Example Action) ---
const selectOptionSchema = elementSchema.extend({
  values: z
    .array(z.string())
    .describe("Array of values to select in the dropdown."),
});
type SelectOptionInput = z.infer<typeof selectOptionSchema>;

const selectOption = defineTool<typeof selectOptionSchema>({
  capability: "core",
  schema: {
    name: "browserbase_select_option",
    description: "Select an option in a dropdown using ref.",
    inputSchema: selectOptionSchema,
  },
  handle: async (
    context: Context,
    params: SelectOptionInput
  ): Promise<ToolResult> => {
    // Get locator directly from snapshot
    const snapshot = context.snapshotOrDie();
    const locator = snapshot.refLocator(params.ref);

    const code = [
      `// Select options [${params.values.join(", ")}] in ${params.element}`,
      // Remove javascript.formatObject, use simple JSON.stringify for code comment
      `// await page.${await generateLocator(
        locator
      )}.selectOption(${JSON.stringify(params.values)});`,
    ];

    const action = async (): Promise<ToolActionResult> => {
      try {
        // Use locator directly for the action
        await locator.waitFor({ state: "visible", timeout: 5000 });
        await locator.selectOption(params.values, { timeout: 5000 });
      } catch (selectError) {
        const errorMsg =
          selectError instanceof Error
            ? selectError.message
            : String(selectError);
        throw new Error(
          `Failed to select option(s) in element '${params.element}'. Error: ${errorMsg}`
        );
      }
      return {
        content: [
          { type: "text", text: `Selected options in: ${params.element}` },
        ],
      };
    };

    return { action, code, captureSnapshot: true, waitForNetwork: true };
  },
});

// --- Tool: Screenshot (Adapted Handle, Example Action) ---
const screenshotSchema = z.object({
  raw: z
    .boolean()
    .optional()
    .describe(
      "Whether to return without compression (PNG). Default is false (JPEG)."
    ),
  element: z
    .string()
    .optional()
    .describe("Human-readable element description."),
  ref: z
    .string()
    .optional()
    .describe("Exact target element reference from the page snapshot.")
});

type ScreenshotInput = z.infer<typeof screenshotSchema>;

const screenshot = defineTool<typeof screenshotSchema>({
  capability: "core",
  schema: {
    name: "browserbase_take_screenshot",
    description: `Take a screenshot of the current page or element using ref.`,
    inputSchema: screenshotSchema,
  },
  handle: async (
    context: Context,
    params: ScreenshotInput
  ): Promise<ToolResult> => {
    if (!!params.element !== !!params.ref) {
      throw new Error("Both element and ref must be provided or neither.");
    }

    const page = await context.getActivePage();
    if (!page) {
      throw new Error("No active page found for screenshot");
    }
    // Conditionally get snapshot only if ref is provided
    let pageSnapshot: PageSnapshot | null = null;
    if (params.ref) {
      pageSnapshot = context.snapshotOrDie();
    }
    const fileType = params.raw ? "png" : "jpeg";
    const fileName = await outputFile(
      context.config,
      `screenshot-${Date.now()}.${fileType}`
    );

    const baseOptions: PageScreenshotOptions = {
      scale: "css",
      timeout: 15000, // Kept existing timeout
    };

    let options: PageScreenshotOptions;

    if (fileType === "jpeg") {
      options = {
        ...baseOptions,
        type: "jpeg",
        quality: 50, // Quality is only for jpeg
        path: fileName,
      };
    } else {
      options = {
        ...baseOptions,
        type: "png",
        path: fileName,
      };
    }

    const isElementScreenshot = params.element && params.ref;
    const code: string[] = [];
    code.push(
      `// Screenshot ${
        isElementScreenshot ? params.element : "viewport"
      } and save it as ${fileName}`
    );

    // Conditionally get locator only if ref and snapshot are available
    const locator =
      params.ref && pageSnapshot ? pageSnapshot.refLocator(params.ref) : null;

    // Use JSON.stringify for code generation as javascript.formatObject is not available
    const optionsForCode = { ...options };
    // delete optionsForCode.path; // Path is an internal detail for saving, not usually part of the "command" log

    if (locator) {
      code.push(
        `// await page.${await generateLocator(
          locator
        )}.screenshot(${JSON.stringify(optionsForCode)});`
      );
    } else {
      code.push(`// await page.screenshot(${JSON.stringify(optionsForCode)});`);
    }

    const action = async (): Promise<ToolActionResult> => {
      // Access config via context.config
      const includeBase64 =
        !context.config.tools?.browserbase_take_screenshot?.omitBase64;

      // Use the page directly for full page screenshots if locator is null
      const screenshotBuffer = locator
        ? await locator.screenshot(options)
        : await page.screenshot(options);

      if (includeBase64) {
        const rawBase64 = screenshotBuffer.toString("base64");
        return {
          content: [
            {
              type: "image",
              format: fileType, // format might be redundant if mimeType is present, but kept for now
              mimeType: fileType === "png" ? `image/png` : `image/jpeg`,
              data: rawBase64,
            },
          ],
        };
      } else {
        // If base64 is not included, return an empty content array
        return { content: [] };
      }
    };

    return {
      code,
      action,
      captureSnapshot: true, 
      waitForNetwork: false, 
    };
  },
});

export async function generateLocator(locator: Locator): Promise<string> {
  return (locator as any)._generateLocatorString();
}

export default [snapshot, click, drag, hover, type, selectOption, screenshot];
