import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { BrowserSession } from "./sessionManager.js";
import {
  getSession,
  defaultSessionId,
  closeAllSessions,
} from "./sessionManager.js";
import type { Tool, ToolContext } from "./tools/tool.js";
import type { Config } from "../config.js";
import {
  Resource,
  CallToolResult,
  TextContent,
  ImageContent,
  ResourceListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Manages the context for tool execution within a specific Browserbase session.
 *
 * Role Analogy:
 * This class holds session-specific state (like latest snapshots, resources)
 * and provides access to the active page/browser for the current session.
 * This is somewhat analogous to the role of the `Tab` class in the Playwright
 * MCP example, which encapsulates state for a single page.
 *
 * Differences from Playwright MCP Context Example:
 * - Browser Lifecycle: This Context does NOT manage the browser launch/
 *   connection lifecycle; that is handled by `sessionManager` (sessionManager.ts) interacting
 *   with the Browserbase API.
 * - Tab Management: This Context focuses on a single active session determined
 *   by `currentSessionId`, unlike the Playwright example which explicitly
 *   manages an array of `Tab` objects.
 * - Execution Model: This Context uses a `run`/`CallToolResult` pattern. Its `run`
 *   method calls `tool.run`, which performs the action and returns the final
 *   result structure. The Playwright example uses a `handle`/`ToolActionResult`
 *   pattern where the Context interprets the result to perform actions.
 */
export class Context {
  private server: Server;
  private config: Config;
  public currentSessionId: string = defaultSessionId;
  private screenshots = new Map<string, string>();
  private latestSnapshots = new Map<string, any>();
  private screenshotResources = new Map<string, { format: string; bytes: string; uri: string }>();

  constructor(server: Server, config: Config) {
    this.server = server;
    this.config = config;
    this.screenshotResources = new Map();
  }

  // --- Snapshot State Handling ---

  getLatestSnapshot(sessionId: string): any | undefined {
    return this.latestSnapshots.get(sessionId);
  }

  setLatestSnapshot(sessionId: string, snapshot: any): void {
    this.latestSnapshots.set(sessionId, snapshot);
  }

  clearLatestSnapshot(sessionId: string): void {
    this.latestSnapshots.delete(sessionId);
  }

  // --- Resource Handling Methods ---

  listResources(): Resource[] {
    const resources: Resource[] = [];
    for (const [name, data] of this.screenshotResources.entries()) {
      resources.push({
        uri: data.uri,
        mimeType: data.format,
        name: `Screenshot: ${name}`,
      });
    }
    return resources;
  }

  readResource(uri: string): { uri: string; mimeType: string; blob: string } {
    const prefix = "mcp://screenshots/";
    if (uri.startsWith(prefix)) {
      const name = uri.split("/").pop() || "";
      const data = this.screenshotResources.get(name);
      if (data) {
        return {
          uri,
          mimeType: data.format,
          blob: data.bytes,
        };
      } else {
        throw new Error(`Screenshot resource not found: ${name}`);
      }
    } else {
      throw new Error(`Resource URI format not recognized: ${uri}`);
    }
  }

  addScreenshot(name: string, format: "png" | "jpeg", bytes: string): void {
    const uri = `mcp://screenshots/${name}`;
    this.screenshotResources.set(name, { format, bytes, uri });
    this.server.notification({ 
      method: "resources/list_changed",
      params: {} 
    });
  }

  // --- Session and Tool Execution ---

  public async getActivePage(): Promise<BrowserSession["page"] | null> {
    const session = await getSession(this.currentSessionId, this.config);
    if (!session || session.page.isClosed()) {
      return null;
    }
    return session.page;
  }

  public async getActiveBrowser(): Promise<BrowserSession["browser"] | null> {
    const session = await getSession(this.currentSessionId, this.config);
    if (!session || !session.browser.isConnected()) {
      return null;
    }
    return session.browser;
  }

  async run(tool: Tool<any>, args: any): Promise<CallToolResult> {
    let initialPage: BrowserSession["page"] | null = null;
    let initialBrowser: BrowserSession["browser"] | null = null;
    if (tool.schema.name !== "browserbase_create_session") {
      initialPage = await this.getActivePage();
      initialBrowser = await this.getActiveBrowser();
      if (!initialPage || !initialBrowser) {
        throw new Error(
          `Failed to get valid page/browser for session ${this.currentSessionId} required by tool ${tool.schema.name}`
        );
      }
    }
    const validatedArgs = args; // Simplified validation
    const toolContext: ToolContext = {
      page: initialPage!,
      browser: initialBrowser!,
      server: this.server,
      sessionId: this.currentSessionId,
      config: this.config,
      context: this,
    };
    let result: CallToolResult;
    try {
      const validatedArgs = tool.schema.inputSchema.parse(args);
      result = await tool.run(toolContext, validatedArgs);

      // Append context info if successful and not snapshot itself
      if (!result.isError && tool.schema.name !== "browserbase_snapshot") {
        const currentPage = await this.getActivePage();
        let currentStateText = `\n\nCurrent Session: ${this.currentSessionId}`;
        if (currentPage && !currentPage.isClosed()) {
          try {
            currentStateText += `\nURL: ${currentPage.url()}\nTitle: ${await currentPage.title()}`;
          } catch (stateError) {
            currentStateText += `\nURL/Title: [Error: ${stateError}]`;
          }
        } else {
          currentStateText += `\nURL/Title: [Page unavailable]`;
        }
        let textContent = result.content?.find((c) => c.type === "text") as
          | TextContent
          | undefined;
        if (textContent) {
          textContent.text += currentStateText;
        } else {
          if (!result.content) result.content = [];
          result.content.push({ type: "text", text: currentStateText });
        }
      }
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMsg = error.issues.map((issue) => issue.message).join(", ");
        return {
          content: [{ type: "text", text: `Error: ${errorMsg}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  async close(): Promise<void> {
    const page = await this.getActivePage();
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (e) {
        console.error(`Error closing page: ${e}`);
      }
    } else {
      console.warn(
        `No active page found for session ${this.currentSessionId} to close.`
      );
    }
    await closeAllSessions();
  }
}
