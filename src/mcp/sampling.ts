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
