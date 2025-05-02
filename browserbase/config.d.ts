export type Config = {
    /** 
     * Whether or not to use Browserbase proxies  
     * https://docs.browserbase.com/features/proxies
     * 
     * @default false
     */
    proxies? : boolean;
    /**
     * Potential Browserbase Context to use 
     * Would be a context ID 
     */
    context?: string;
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
      },
};
