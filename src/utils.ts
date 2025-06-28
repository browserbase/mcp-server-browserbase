/**
 * Sanitizes a message to ensure it's properly formatted JSON
 * @param message The message to sanitize
 * @returns A sanitized JSON string
 */
export function sanitizeMessage(message: unknown): string {
  try {
    // Ensure the message is properly stringified JSON
    if (typeof message === "string") {
      JSON.parse(message); // Validate JSON structure
      return message;
    }
    return JSON.stringify(message);
  } catch {
    return JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: "Parse error",
      },
      id: null,
    });
  }
}

export function sanitizeForFilePath(s: string) {
  return s.replace(/[^a-zA-Z0-9_.-]/g, "_"); // More robust sanitization
}
