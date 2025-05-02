export type Config = {
    /** 
     * Whether or not to use Browserbase proxies  
     * https://docs.browserbase.com/features/proxies
     * 
     * @default false
     */
    proxies? : boolean;
    /**
     * The browser to use
     * @default "chrome"
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
      },
};
