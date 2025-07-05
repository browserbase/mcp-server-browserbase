import type { Stagehand } from "@browserbasehq/stagehand";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "../config.d.ts";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listResources, readResource } from "./mcp/resources.js";
import { getSession, defaultSessionId } from "./sessionManager.js";
import type { MCPTool, BrowserSession } from "./types/types.js";

export class Context {
  public readonly config: Config;
  private server: Server;
  public currentSessionId: string = defaultSessionId;

  constructor(server: Server, config: Config) {
    this.server = server;
    this.config = config;
  }

  public getServer(): Server {
    return this.server;
  }

  /**
   * Gets the Stagehand instance for the current session from SessionManager
   */
  public async getStagehand(
    sessionId: string = this.currentSessionId,
  ): Promise<Stagehand> {
    const session = await getSession(sessionId, this.config);
    if (!session) {
      throw new Error(`No session found for ID: ${sessionId}`);
    }
    return session.stagehand;
  }

  public async getActivePage(): Promise<BrowserSession["page"] | null> {
    // Get page from session manager
    const session = await getSession(this.currentSessionId, this.config);
    if (session && session.page && !session.page.isClosed()) {
      return session.page;
    }

    return null;
  }

  public async getActiveBrowser(
    createIfMissing: boolean = true,
  ): Promise<BrowserSession["browser"] | null> {
    const session = await getSession(
      this.currentSessionId,
      this.config,
      createIfMissing,
    );
    if (!session || !session.browser || !session.browser.isConnected()) {
      return null;
    }
    return session.browser;
  }

  async run(tool: MCPTool, args: unknown): Promise<CallToolResult> {
    try {
      console.error(
        `Executing tool: ${tool.schema.name} with args: ${JSON.stringify(args)}`,
      );

      // Check if this tool has a handle method (new tool system)
      if ("handle" in tool && typeof tool.handle === "function") {
        const toolResult = await tool.handle(this, args);

        if (toolResult?.action) {
          const actionResult = await toolResult.action();
          const content = actionResult?.content || [];

          return {
            content: Array.isArray(content)
              ? content
              : [{ type: "text", text: "Action completed successfully." }],
            isError: false,
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `${tool.schema.name} completed successfully.`,
              },
            ],
            isError: false,
          };
        }
      } else {
        // Fallback for any legacy tools without handle method
        throw new Error(
          `Tool ${tool.schema.name} does not have a handle method`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Tool ${tool.schema?.name || "unknown"} failed: ${errorMessage}`,
      );
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * List resources
   * Documentation: https://modelcontextprotocol.io/docs/concepts/resources
   */
  listResources() {
    return listResources();
  }

  /**
   * Read a resource by URI
   * Documentation: https://modelcontextprotocol.io/docs/concepts/resources
   */
  readResource(uri: string) {
    return readResource(uri);
  }
}
