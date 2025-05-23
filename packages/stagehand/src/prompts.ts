/**
 * Prompts module for the Stagehand MCP server
 * Contains prompts definitions and handlers for prompt-related requests
 */

// Define the prompts
export const PROMPTS = [
  {
    name: "click_search_button",
    description: "A prompt template for clicking on a search button",
    arguments: [] // No arguments required for this specific prompt
  }
];

/**
 * Get a prompt by name
 * @param name The name of the prompt to retrieve
 * @returns The prompt definition or throws an error if not found
 */
export function getPrompt(name: string) {
  if (name === "click_search_button") {
    return {
      description: "This prompt provides instructions for clicking on a search button",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Please click on the search button"
          }
        }
      ]
    };
  }
  
  throw new Error(`Invalid prompt name: ${name}`);
} 