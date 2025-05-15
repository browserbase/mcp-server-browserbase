// Wrapper function for MCP handler with auth
export const withMcpAuth = (handler: (req: Request) => Promise<Response>) => {
  return async (req: Request) => {
    // Parse API key and project ID from request
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-api-key") || url.searchParams.get("api_key");
    const projectId = req.headers.get("x-project-id") || url.searchParams.get("project_id");

    if (apiKey) {
      req.headers.set("x-api-key", apiKey);
    }
    if (projectId) {
      req.headers.set("x-project-id", projectId);
    }

    // If authenticated, proceed with the MCP handler
    return handler(req);
  };
};
