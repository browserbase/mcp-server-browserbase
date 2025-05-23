import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { BrowserSession } from "./sessionManager.js";
import {
  getSession,
  defaultSessionId,
} from "./sessionManager.js";
import type { Tool, ToolResult } from "./tools/tool.js";
import type { Config } from "../config.js";
import {
  Resource,
  CallToolResult,
  TextContent,
  ImageContent,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PageSnapshot } from "./pageSnapshot.js";
import type { Page } from "playwright-core"; 

export type ToolActionResult =
  | { content?: (ImageContent | TextContent)[] }
  | undefined
  | void;

/**
 * Manages the context for tool execution within a specific Browserbase session.
 */

export class Context {
  private server: Server;
  public readonly config: Config;
  public currentSessionId: string = defaultSessionId;
  private latestSnapshots = new Map<string, PageSnapshot>();
  private screenshotResources = new Map<
    string,
    { format: string; bytes: string; uri: string }
  >();

  constructor(server: Server, config: Config) {
    this.server = server;
    this.config = config;
    this.screenshotResources = new Map();
  }

  // --- Snapshot State Handling (Using PageSnapshot) ---

  /**
   * Returns the latest PageSnapshot for the currently active session.
   * Throws an error if no snapshot is available for the active session.
   */
  snapshotOrDie(): PageSnapshot {
    const snapshot = this.latestSnapshots.get(this.currentSessionId);
    if (!snapshot) {
      throw new Error(
        `No snapshot available for the current session (${this.currentSessionId}). Capture a snapshot first.`
      );
    }
    return snapshot;
  }

  /**
   * Clears the snapshot for the currently active session.
   */
  clearLatestSnapshot(): void {
    this.latestSnapshots.delete(this.currentSessionId);
  }

  /**
   * Captures a new PageSnapshot for the currently active session and stores it.
   * Returns the captured snapshot or undefined if capture failed.
   */
  async captureSnapshot(): Promise<PageSnapshot | undefined> {
    const logPrefix = `[Context.captureSnapshot] ${new Date().toISOString()} Session ${
      this.currentSessionId
    }:`;
    let page;
    try {
      page = await this.getActivePage();
    } catch (error) {
      this.clearLatestSnapshot();
      return undefined;
    }

    if (!page) {
      this.clearLatestSnapshot();
      return undefined;
    }

    try {
      await this.waitForTimeout(100); // Small delay for UI settlement
      const snapshot = await PageSnapshot.create(page);
      this.latestSnapshots.set(this.currentSessionId, snapshot);
      return snapshot;
    } catch (error) {
      process.stderr.write(
        `${logPrefix} Failed to capture snapshot: ${
          error instanceof Error ? error.message : String(error)
        }\\n`
      ); // Enhanced logging
      this.clearLatestSnapshot();
      return undefined;
    }
  }

  // --- Resource Handling Methods ---

  listResources(): Resource[] {
    const resources: Resource[] = [];
    for (const [name, data] of this.screenshotResources.entries()) {
      resources.push({
        uri: data.uri,
        mimeType: `image/${data.format}`, // Ensure correct mime type
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
          mimeType: `image/${data.format}`, // Ensure correct mime type
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
      params: {},
    });
  }

  // --- Session and Tool Execution ---

  public async getActivePage(): Promise<BrowserSession["page"] | null> {
    const session = await getSession(this.currentSessionId, this.config);
    if (!session || !session.page || session.page.isClosed()) {
      try {
        // getSession does not support a refresh flag currently.
        // If a session is invalid, it needs to be recreated or re-established upstream.
        // For now, just return null if the fetched session is invalid.
        const currentSession = await getSession(
          this.currentSessionId,
          this.config
        );
        if (
          !currentSession ||
          !currentSession.page ||
          currentSession.page.isClosed()
        ) {
          return null;
        }
        return currentSession.page;
      } catch (refreshError) {
        return null;
      }
    }
    return session.page;
  }

  public async getActiveBrowser(): Promise<BrowserSession["browser"] | null> {
    const session = await getSession(this.currentSessionId, this.config);
    if (!session || !session.browser || !session.browser.isConnected()) {
      try {
        // getSession does not support a refresh flag currently.
        const currentSession = await getSession(
          this.currentSessionId,
          this.config
        );
        if (
          !currentSession ||
          !currentSession.browser ||
          !currentSession.browser.isConnected()
        ) {
          return null;
        }
        return currentSession.browser;
      } catch (refreshError) {
        return null;
      }
    }
    return session.browser;
  }

  public async waitForTimeout(timeoutMillis: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, timeoutMillis));
  }

  private createErrorResult(message: string, toolName: string): CallToolResult {
    return {
      content: [{ type: "text", text: `Error: ${message}`, toolName: toolName }],
      isError: true,
    };
  }

  async run(tool: Tool<any>, args: any): Promise<CallToolResult> {
    const toolName = tool.schema.name;
    let initialPage: Page | null = null;
    let initialBrowser: BrowserSession["browser"] | null = null;
    let toolResultFromHandle: ToolResult | null = null; // Legacy handle result
    let finalResult: CallToolResult = {
      // Initialize finalResult here
      content: [{ type: "text", text: `Initialization error for ${toolName}` }],
      isError: true,
    };

    const logPrefix = `[Context.run ${toolName}] ${new Date().toISOString()}:`;

    let validatedArgs: any;
    try {
      validatedArgs = tool.schema.inputSchema.parse(args);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMsg = error.issues.map((issue) => issue.message).join(", ");
        return this.createErrorResult(
          `Input validation failed: ${errorMsg}`,
          toolName
        );
      }
      return this.createErrorResult(
        `Input validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        toolName
      );
    }

    const previousSessionId = this.currentSessionId;
    if (
      validatedArgs?.sessionId &&
      validatedArgs.sessionId !== this.currentSessionId
    ) {
      this.currentSessionId = validatedArgs.sessionId;
      this.clearLatestSnapshot();
    }

    if (toolName !== "browserbase_session_create") {
      try {
        const session = await getSession(this.currentSessionId, this.config);
        if (
          !session ||
          !session.page ||
          session.page.isClosed() ||
          !session.browser ||
          !session.browser.isConnected()
        ) {
          if (this.currentSessionId !== previousSessionId) {
            this.currentSessionId = previousSessionId;
          }
          throw new Error(
            `Session ${this.currentSessionId} is invalid or browser/page is not available.`
          );
        }
        initialPage = session.page;
        initialBrowser = session.browser;
      } catch (sessionError) {
        return this.createErrorResult(
          `Error retrieving or validating session ${this.currentSessionId}: ${
            sessionError instanceof Error
              ? sessionError.message
              : String(sessionError)
          }`,
          toolName
        );
      }
    }

    let toolActionOutput: ToolActionResult | undefined = undefined; // New variable to store direct tool action output
    let actionSucceeded = false;
    let shouldCaptureSnapshotAfterAction = false;
    let postActionSnapshot: PageSnapshot | undefined = undefined;

    try {
      let actionToRun: (() => Promise<ToolActionResult>) | undefined =
        undefined;
      let shouldCaptureSnapshot = false;

      try {
        if ("handle" in tool && typeof tool.handle === "function") {
          toolResultFromHandle = await tool.handle(this as any, validatedArgs);
          actionToRun = toolResultFromHandle?.action;
          shouldCaptureSnapshot =
            toolResultFromHandle?.captureSnapshot ?? false;
          shouldCaptureSnapshotAfterAction = shouldCaptureSnapshot;
        } else {
          throw new Error(
            `Tool ${toolName} could not be handled (no handle method).`
          );
        }

        if (actionToRun) {
          toolActionOutput = await actionToRun();
          actionSucceeded = true;
        } else {
          throw new Error(`Tool ${toolName} handled without action.`);
        }
      } catch (error) {
        process.stderr.write(
          `${logPrefix} Error executing tool ${toolName}: ${
            error instanceof Error ? error.message : String(error)
          }\\n`
        ); 
        if (error instanceof Error && error.stack) {
          process.stderr.write(`${logPrefix} Stack Trace: ${error.stack}\\n`);
        }
        // -----------------------
        finalResult = this.createErrorResult(
          `Execution failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          toolName
        );
        actionSucceeded = false;
        shouldCaptureSnapshotAfterAction = false;
        if (
          this.currentSessionId !== previousSessionId &&
          toolName !== "browserbase_session_create"
        ) {
          this.currentSessionId = previousSessionId;
        }
      } finally {
        if (actionSucceeded && shouldCaptureSnapshotAfterAction) {
          const preSnapshotDelay = 500;
          await this.waitForTimeout(preSnapshotDelay);
          try {
            postActionSnapshot = await this.captureSnapshot();
            if (postActionSnapshot) {
              process.stderr.write(
                `[Context.run ${toolName}] Added snapshot to final result text.\n`
              );
            } else {
              process.stderr.write(
                `[Context.run ${toolName}] WARN: Snapshot was expected after action but failed to capture.\n`
              ); // Keep warning
            }
          } catch (postSnapError) {
            process.stderr.write(
              `[Context.run ${toolName}] WARN: Error capturing post-action snapshot: ${
                postSnapError instanceof Error
                  ? postSnapError.message
                  : String(postSnapError)
              }\n`
            ); // Keep warning
          }
        } else if (
          actionSucceeded &&
          toolName === "browserbase_snapshot" &&
          !postActionSnapshot
        ) {
          postActionSnapshot = this.latestSnapshots.get(this.currentSessionId);
        }

        if (actionSucceeded) {
          const finalContentItems: (TextContent | ImageContent)[] = [];

          // 1. Add content from the tool action itself
          if (toolActionOutput?.content && toolActionOutput.content.length > 0) {
            finalContentItems.push(...toolActionOutput.content);
          } else {
            // If toolActionOutput.content is empty/undefined but action succeeded,
            // provide a generic success message.
            finalContentItems.push({ type: "text", text: `${toolName} action completed successfully.` });
          }

          // 2. Prepare and add additional textual information (URL, Title, Snapshot)
          const additionalInfoParts: string[] = [];
          const currentPage = await this.getActivePage();

          if (currentPage) {
            try {
              const url = currentPage.url();
              const title = await currentPage
                .title()
                .catch(() => "[Error retrieving title]");
              additionalInfoParts.push(`- Page URL: ${url}`);
              additionalInfoParts.push(`- Page Title: ${title}`);
            } catch (pageStateError) {
              additionalInfoParts.push(
                "- [Error retrieving page state after action]"
              );
            }
          } else {
            additionalInfoParts.push("- [Page unavailable after action]");
          }

          const snapshotToAdd = postActionSnapshot;
          if (snapshotToAdd) {
            additionalInfoParts.push(
              `- Page Snapshot\n\`\`\`yaml\n${snapshotToAdd.text()}\n\`\`\`\n`
            );
          } else {
            additionalInfoParts.push(
              `- [No relevant snapshot available after action]`
            );
          }

          // 3. Add the additional information as a new TextContent item if it's not empty
          if (additionalInfoParts.length > 0) {
            // Add leading newlines if there's preceding content, to maintain separation
            const additionalInfoText = (finalContentItems.length > 0 ? "\\n\\n" : "") + additionalInfoParts.join("\\n");
            finalContentItems.push({ type: "text", text: additionalInfoText });
          }

          finalResult = {
            content: finalContentItems,
            isError: false,
          };
        } else {
          // Error result is already set in catch block, but ensure it IS set.
          if (!finalResult || !finalResult.isError) {
            finalResult = this.createErrorResult(
              `Unknown error occurred during ${toolName}`,
              toolName
            );
          }
        }
        return finalResult;
      }
    } catch (error) {
      process.stderr.write(
        `${logPrefix} Error running tool ${toolName}: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
      throw error;
    }
  }
}