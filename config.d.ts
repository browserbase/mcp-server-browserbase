import type { Cookie } from "playwright-core";
import type { AvailableModelSchema } from "@browserbasehq/stagehand";

export type Config = {
  /**
   * The Browserbase API Key to use
   */
  browserbaseApiKey?: string;
  /**
   * The Browserbase Project ID to use
   */
  browserbaseProjectId?: string;
  /**
   * Whether or not to use Browserbase proxies
   * https://docs.browserbase.com/features/proxies
   *
   * @default false
   */
  proxies?: boolean;
  /**
   * Use advanced stealth mode. Only available to Browserbase Scale Plan users.
   *
   * @default false
   */
  advancedStealth?: boolean;
  /**
   * Potential Browserbase Context to use
   * Would be a context ID
   */
  context?: {
    /**
     * The ID of the context to use
     */
    contextId?: string;
    /**
     * Whether or not to persist the context
     *
     * @default true
     */
    persist?: boolean;
  };
  /**
   *
   */
  viewPort?: {
    /**
     * The width of the browser
     */
    browserWidth?: number;
    /**
     * The height of the browser
     */
    browserHeight?: number;
  };
  /**
   * Cookies to inject into the Browserbase context
   * Format: Array of cookie objects with name, value, domain, and optional path, expires, httpOnly, secure, sameSite
   */
  cookies?: Cookie[];
  /**
   * Whether or not to port to a server
   *
   */
  server?: {
    /**
     * The port to listen on for SHTTP or MCP transport.
     */
    port?: number;
    /**
     * The host to bind the server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.
     */
    host?: string;
  };
  /**
   * The Model that Stagehand uses
   * Available models: OpenAI, Claude, Gemini, Cerebras, Groq, and other providers
   *
   * @default "google/gemini-2.0-flash"
   */
  modelName?: AvailableModelSchema;
  /**
   * API key for the custom model provider
   * Required when using a model other than the default google/gemini-2.0-flash
   */
  modelApiKey?: string;
};
