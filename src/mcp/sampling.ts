/**
 * Sampling module for the Browserbase MCP server
 * Implements sampling capability to request LLM completions from clients
 * Docs: https://modelcontextprotocol.io/docs/concepts/sampling
 */

/**
 * Sampling capability configuration
 * This indicates that the server can request LLM completions
 */
export const SAMPLING_CAPABILITY = {};

/**
 * Note: Sampling in MCP is initiated BY the server TO the client.
 * The server sends sampling/createMessage requests to ask the client
 * for LLM completions. This is useful for intelligent browser automation
 * where the server needs AI assistance to analyze pages and make decisions.
 *
 * Currently, sampling support depends on the MCP client implementation.
 * Not all clients support sampling yet. (ie claude desktop)
 */

/**
 * Type definitions for sampling messages
 */
export type SamplingMessage = {
  role: "user" | "assistant";
  content: {
    type: "text" | "image";
    text?: string;
    data?: string; // base64 for images
    mimeType?: string;
  };
};

/**
 * Pre-built sampling templates for common browser automation scenarios
 */
export const SAMPLING_TEMPLATES = {
  /**
   * Analyze a page to determine what actions are available
   */
  analyzePageActions: (
    pageContent: string,
    screenshot?: string,
  ): SamplingMessage[] => [
    {
      role: "user",
      content: {
        type: "text",
        text: `Analyze this webpage and identify the main interactive elements and possible actions.
        
Page content:
${pageContent}

Please list:
1. Main navigation elements
2. Forms and input fields
3. Buttons and clickable elements
4. Key information displayed
5. Suggested next actions for common automation tasks`,
      },
    },
    ...(screenshot
      ? [
          {
            role: "user" as const,
            content: {
              type: "image" as const,
              data: screenshot,
              mimeType: "image/png",
            },
          },
        ]
      : []),
  ],

  /**
   * Determine next steps in a multi-step process
   */
  determineNextStep: (
    currentState: string,
    goal: string,
  ): SamplingMessage[] => [
    {
      role: "user",
      content: {
        type: "text",
        text: `Current state of the browser automation:
${currentState}

Goal: ${goal}

What should be the next action to take? Consider:
1. Are we on the right page?
2. What elements need to be interacted with?
3. Is there any data to extract first?
4. Are there any errors or blockers visible?

Provide a specific, actionable next step.`,
      },
    },
  ],

  /**
   * Extract structured data from a page
   */
  extractStructuredData: (
    pageContent: string,
    dataSchema: string,
  ): SamplingMessage[] => [
    {
      role: "user",
      content: {
        type: "text",
        text: `Extract structured data from this webpage according to the schema.

Page content:
${pageContent}

Expected data schema:
${dataSchema}

Return the extracted data as valid JSON matching the schema. If any fields cannot be found, use null.`,
      },
    },
  ],

  /**
   * Handle error or unexpected state
   */
  handleError: (error: string, pageState: string): SamplingMessage[] => [
    {
      role: "user",
      content: {
        type: "text",
        text: `The browser automation encountered an error:

Error: ${error}

Current page state:
${pageState}

Suggest how to recover from this error:
1. What might have caused this?
2. What alternative actions could be taken?
3. Should we retry, navigate elsewhere, or try a different approach?`,
      },
    },
  ],

  /**
   * Interpret complex UI patterns
   */
  interpretUI: (screenshot: string, instruction: string): SamplingMessage[] => [
    {
      role: "user",
      content: {
        type: "text",
        text: `Analyze this screenshot and help with: ${instruction}`,
      },
    },
    {
      role: "user",
      content: {
        type: "image",
        data: screenshot,
        mimeType: "image/png",
      },
    },
  ],
};

/**
 * Helper function to create a sampling request structure
 * This shows what a sampling request would look like when sent to the client
 */
export function createSamplingRequest(
  messages: SamplingMessage[],
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    includeContext?: "none" | "thisServer" | "allServers";
  },
) {
  return {
    method: "sampling/createMessage",
    params: {
      messages,
      systemPrompt:
        options?.systemPrompt ||
        "You are an expert browser automation assistant helping to analyze web pages and determine optimal automation strategies.",
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 1000,
      includeContext: options?.includeContext || "thisServer",
      modelPreferences: {
        hints: [{ name: "claude-3" }, { name: "gpt-4" }],
        intelligencePriority: 0.8,
        speedPriority: 0.2,
      },
    },
  };
}
