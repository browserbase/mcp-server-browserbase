import { z } from "zod";
import type { Tool, ToolSchema, ToolResult } from "./tool.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../context.js";
import { Browserbase } from "@browserbasehq/sdk";

// Store contexts in memory 
const contexts = new Map<string, string>(); 

// --- Tool: Create Context ---
const CreateContextInputSchema = z.object({
  name: z
    .string()
    .optional()
    .describe("Optional friendly name to reference this context later (otherwise, you'll need to use the returned ID)"),
});
type CreateContextInput = z.infer<typeof CreateContextInputSchema>;

const createContextSchema: ToolSchema<typeof CreateContextInputSchema> = {
  name: "browserbase_context_create",
  description: "Create a new Browserbase context for reusing cookies, authentication, and cached data across browser sessions",
  inputSchema: CreateContextInputSchema,
};

async function handleCreateContext(
  context: Context,
  params: CreateContextInput
): Promise<ToolResult> {
  try {
    const config = context.config;
    
    if (!config.browserbaseApiKey || !config.browserbaseProjectId) {
      throw new Error("Browserbase API Key or Project ID is missing in the configuration");
    }
    
    const bb = new Browserbase({
      apiKey: config.browserbaseApiKey,
    });

    console.error("Creating new Browserbase context");
    const bbContext = await bb.contexts.create({
      projectId: config.browserbaseProjectId,
    });

    console.error(`Successfully created context: ${bbContext.id}`);
    
    // Store context ID with optional name if provided
    const contextName = params.name || bbContext.id;
    contexts.set(contextName, bbContext.id);
    
    const result: ToolActionResult = {
      content: [
        {
          type: "text",
          text: `Created new Browserbase context with ID: ${bbContext.id}${params.name ? ` and name: ${params.name}` : ''}`,
        },
      ],
    };

    return {
      resultOverride: result,
      action: async () => {
        console.error("Create Context action");
        return result;
      },
      code: [],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  } catch (error: any) {
    console.error(`CreateContext handle failed: ${error.message || error}`);
    throw new Error(`Failed to create Browserbase context: ${error.message || error}`);
  }
}

// --- Tool: Delete Context ---
const DeleteContextInputSchema = z.object({
  contextId: z
    .string()
    .optional()
    .describe("The context ID to delete (required if name not provided)"),
  name: z
    .string()
    .optional()
    .describe("The friendly name of the context to delete (required if contextId not provided)"),
});
type DeleteContextInput = z.infer<typeof DeleteContextInputSchema>;

const deleteContextSchema: ToolSchema<typeof DeleteContextInputSchema> = {
  name: "browserbase_context_delete",
  description: "Delete a Browserbase context when you no longer need it",
  inputSchema: DeleteContextInputSchema,
};

async function handleDeleteContext(
  context: Context,
  params: DeleteContextInput
): Promise<ToolResult> {
  try {
    const config = context.config;
    
    if (!config.browserbaseApiKey) {
      throw new Error("Browserbase API Key is missing in the configuration");
    }
    
    if (!params.contextId && !params.name) {
      throw new Error("Missing required argument: either contextId or name must be provided");
    }

    // Resolve context ID either directly or by name
    let contextId = params.contextId;
    if (!contextId && params.name) {
      contextId = contexts.get(params.name);
      if (!contextId) {
        throw new Error(`Context with name "${params.name}" not found`);
      }
    }

    console.error(`Deleting Browserbase context: ${contextId}`);
    
    // Delete using Browserbase API
    const response = await fetch(`https://api.browserbase.com/v1/contexts/${contextId}`, {
      method: 'DELETE',
      headers: {
        'X-BB-API-Key': config.browserbaseApiKey,
      },
    });
    
    if (response.status !== 204) {
      const errorText = await response.text();
      throw new Error(`Failed to delete context with status ${response.status}: ${errorText}`);
    }
    
    // Remove from local store
    if (params.name) {
      contexts.delete(params.name);
    }
    
    // Delete by ID too (in case it was stored multiple ways)
    for (const [name, id] of contexts.entries()) {
      if (id === contextId) {
        contexts.delete(name);
      }
    }
    
    console.error(`Successfully deleted context: ${contextId}`);
    
    const result: ToolActionResult = {
      content: [
        {
          type: "text",
          text: `Deleted Browserbase context with ID: ${contextId}`,
        },
      ],
    };

    return {
      resultOverride: result,
      action: async () => {
        console.error("Delete Context action");
        return result;
      },
      code: [],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  } catch (error: any) {
    console.error(`DeleteContext handle failed: ${error.message || error}`);
    throw new Error(`Failed to delete Browserbase context: ${error.message || error}`);
  }
}

// Helper function to get a context ID from name or direct ID (exported for use by session.ts)
export function getContextId(nameOrId: string): string | undefined {
  // First check if it's a direct context ID
  if (nameOrId.length == 32) {   // 32 char uuid
    return nameOrId;
  }
  
  // Otherwise, look it up by name
  return contexts.get(nameOrId);
}

// Define tools
const createContextTool: Tool<typeof CreateContextInputSchema> = {
  capability: "core",
  schema: createContextSchema,
  handle: handleCreateContext,
};

const deleteContextTool: Tool<typeof DeleteContextInputSchema> = {
  capability: "core",
  schema: deleteContextSchema,
  handle: handleDeleteContext,
};

// Export as an array of tools
export default [createContextTool, deleteContextTool]; 