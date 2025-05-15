import { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";

/**
 * Creates a standardized error result for tool calls.
 * @param message The error message text.
 * @param toolName Optional tool name for logging/context.
 * @returns CallToolResult object indicating an error.
 */
export function createErrorResult(message: string, toolName?: string): CallToolResult {
    const prefix = toolName ? `[${toolName}] Error: ` : "Error: ";
    // console.error(prefix + message);
    return {
        content: [{ type: "text", text: prefix + message } as TextContent],
        isError: true,
    };
}

/**
 * Creates a standardized success result with text content.
 * @param message The success message text.
 * @param toolName Optional tool name for logging/context.
 * @returns CallToolResult object indicating success.
 */
export function createSuccessResult(message: string, toolName?: string): CallToolResult {
    const prefix = toolName ? `[${toolName}] Success: ` : "Success: ";
    // console.log(prefix + message); // Log success
    return {
        content: [{ type: "text", text: message } as TextContent],
        isError: false,
    };
}