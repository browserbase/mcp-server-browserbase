import type { Stagehand } from "@browserbasehq/stagehand";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "../config.d.ts";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listResources, readResource } from "./mcp/resources.js";
import { store } from "./tools/helpers/session.js";
import type { MCPTool, StagehandSession } from "./types/types.js";

export class Context {
  public readonly config: Config;
  private server: Server;
  private _currentSession: StagehandSession | null = null;

  constructor(server: Server, config: Config) {
    this.server = server;
    this.config = config;
  }

  public getServer(): Server {
    return this.server;
  }

  /**
   * Gets the Stagehand instance for the current session
   */
  public async getStagehand(): Promise<Stagehand> {
    const session = await this.getCurrentSession();
    return session.stagehand;
  }

  public async getActivePage(): Promise<StagehandSession["page"] | null> {
    try {
      const session = await this.getCurrentSession();
      if (session.page && !session.page.isClosed()) {
        return session.page;
      }
    } catch {
      // Session not available
    }
    return null;
  }

  public async getActiveBrowser(): Promise<StagehandSession["browser"] | null> {
    try {
      const session = await this.getCurrentSession();
      if (session.browser && session.browser.isConnected()) {
        return session.browser;
      }
    } catch {
      // Session not available
    }
    return null;
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

  /**
   * Gets or creates the current session
   */
  private async getCurrentSession(): Promise<StagehandSession> {
    if (!this._currentSession) {
      const sessionStore = store(this.config);
      this._currentSession = await sessionStore.create();
    }
    return this._currentSession;
  }
}
