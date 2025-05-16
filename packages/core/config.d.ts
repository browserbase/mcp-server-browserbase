import type { Cookie } from "playwright-core";

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
         * The port to listen on for SSE or MCP transport.
         */
        port?: number;
        /**
         * The host to bind the server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.
         */
        host?: string;
    };
    tools?: {
        /**
         * Configuration for the browser_take_screenshot tool.
         */
        browserbase_take_screenshot?: {
            /**
             * Whether to disable base64-encoded image responses to the clients that
             * don't support binary data or prefer to save on tokens.
            */
            omitBase64?: boolean;
        }
    }
};