 // Wrapper function for MCP handler with auth
export const withMcpAuth = (handler: (req: Request) => Promise<Response>) => {
    return async (req: Request) => {
      const url = new URL(req.url);
      const browserbaseApiKey = url.searchParams.get("browserbaseApiKey");
      const browserbaseProjectId = url.searchParams.get("browserbaseProjectId");
      const proxies = url.searchParams.get("proxies");
      const advancedStealth = url.searchParams.get("advancedStealth");
      const contextId = url.searchParams.get("contextId");
      const persist = url.searchParams.get("persist");
      const browserWidth = url.searchParams.get("browserWidth");
      const browserHeight = url.searchParams.get("browserHeight");
  
      if (!browserbaseApiKey || !browserbaseProjectId) {
        return new Response(null, { status: 401 });
      }
  
      req.headers.set("x-api-key", browserbaseApiKey);
      req.headers.set("x-project-id", browserbaseProjectId);
  
      if (proxies) {
        req.headers.set("x-proxies", proxies);
      }
  
      if (advancedStealth) {
        req.headers.set("x-advanced-stealth", advancedStealth);
      }
  
      if (contextId) {
        req.headers.set("x-context-id", contextId);
      }
  
      if (persist) {
        req.headers.set("x-persist", persist);
      }
  
      if (browserWidth) {
        req.headers.set("x-browser-width", browserWidth);
      }
  
      if (browserHeight) {
        req.headers.set("x-browser-height", browserHeight);
      }
  
      return handler(req);
    };
  };