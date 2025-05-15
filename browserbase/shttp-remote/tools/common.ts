export {}; // Ensure file is treated as a module 

import { z } from 'zod';
import type { Tool, ToolSchema, ToolResult } from "./tool"; 
import type { Context } from '../context'; 
import type { ToolActionResult } from '../context'; 

// --- Tool: Wait ---
const WaitInputSchema = z.object({
    time: z.number().describe("Time in seconds")
});
type WaitInput = z.infer<typeof WaitInputSchema>;

const waitSchema: ToolSchema<typeof WaitInputSchema> = {
    name: "browserbase_wait",
    description: "Wait for a specified time in seconds",
    inputSchema: WaitInputSchema,
};

// Handle function for Wait
async function handleWait(context: Context, params: WaitInput): Promise<ToolResult> { // Uses Context, returns ToolResult
    const action = async (): Promise<ToolActionResult> => {
        await new Promise(resolve => setTimeout(resolve, params.time * 1000));
        return { content: [{ type: 'text', text: `Waited for ${params.time} seconds.` }] };
    };
    return { action, code: [], captureSnapshot: false, waitForNetwork: false };
}

// Define tool using handle
const waitTool: Tool<typeof WaitInputSchema> = {
    capability: 'core', // Add capability
    schema: waitSchema,
    handle: handleWait,
};


// --- Tool: Close ---
const CloseInputSchema = z.object({
    random_string: z.string().optional().describe("Dummy parameter") // Keep schema if needed
});
type CloseInput = z.infer<typeof CloseInputSchema>;

const closeSchema: ToolSchema<typeof CloseInputSchema> = {
    name: "browserbase_close",
    description: "Close the current page...",
    inputSchema: CloseInputSchema,
};

// Handle function for Close
async function handleClose(context: Context, params: CloseInput): Promise<ToolResult> {
    const action = async (): Promise<ToolActionResult> => {
        const page = await context.getActivePage();
        if (page && !page.isClosed()) {
            await page.close();
            return { content: [{ type: 'text', text: `Page closed.` }] };
        } else {
            return { content: [{ type: 'text', text: `No active page to close.` }] };
        }
    };
    return { action, code: [], captureSnapshot: false, waitForNetwork: false };
}

// Define tool using handle
const closeTool: Tool<typeof CloseInputSchema> = {
    capability: 'core', // Add capability
    schema: closeSchema,
    handle: handleClose,
};


// --- Tool: Resize ---
const ResizeInputSchema = z.object({
    width: z.number(),
    height: z.number()
});
type ResizeInput = z.infer<typeof ResizeInputSchema>;

const resizeSchema: ToolSchema<typeof ResizeInputSchema> = {
    name: "browserbase_resize",
    description: "Resize window...",
    inputSchema: ResizeInputSchema,
};

// Handle function for Resize
async function handleResize(context: Context, params: ResizeInput): Promise<ToolResult> {
    const action = async (): Promise<ToolActionResult> => {
        const page = await context.getActivePage();
        if (page && !page.isClosed()) {
            await page.setViewportSize({ width: params.width, height: params.height });
            return { content: [{ type: 'text', text: `Resized page to ${params.width}x${params.height}.` }] };
        } else {
            return { content: [{ type: 'text', text: `No active page to resize.` }] };
        }
    };
    return { action, code: [], captureSnapshot: true, waitForNetwork: false };
}

// Define tool using handle
const resizeTool: Tool<typeof ResizeInputSchema> = {
    capability: 'core', // Add capability
    schema: resizeSchema,
    handle: handleResize,
};


// Export array of tools directly
export default [
    waitTool,
    closeTool,
    resizeTool,
];