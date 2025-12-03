import { Stagehand } from "@browserbasehq/stagehand";
import type { Config } from "../config.d.ts";
import type { BrowserSession, CreateSessionParams } from "./types/types.js";
import { randomUUID } from "crypto";

/**
 * Create a configured Stagehand instance
 * This is used internally by SessionManager to initialize browser sessions
 */

export const createStagehandInstance = async (
  config: Config,
  params: CreateSessionParams = {},
  sessionId: string,
): Promise<Stagehand> => {
  const apiKey = params.apiKey || config.browserbaseApiKey;
  const projectId = params.projectId || config.browserbaseProjectId;

  if (!apiKey || !projectId) {
    throw new Error("Browserbase API Key and Project ID are required");
  }

  const modelName = params.modelName || config.modelName || "gemini-2.0-flash";
  const modelApiKey =
    config.modelApiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey,
    projectId,
    model: modelApiKey
      ? {
          apiKey: modelApiKey,
          modelName: modelName,
        }
      : modelName,
    ...(params.browserbaseSessionID && {
      browserbaseSessionID: params.browserbaseSessionID,
    }),
    experimental: config.experimental ?? false,
    browserbaseSessionCreateParams: {
      projectId,
      proxies: config.proxies,
      keepAlive: config.keepAlive ?? false,
      browserSettings: {
        viewport: {
          width: config.viewPort?.browserWidth ?? 1288,
          height: config.viewPort?.browserHeight ?? 711,
        },
        context: config.context?.contextId
          ? {
              id: config.context?.contextId,
              persist: config.context?.persist ?? true,
            }
          : undefined,
        advancedStealth: config.advancedStealth ?? undefined,
      },
      userMetadata: {
        mcp: "true",
      },
    },
    logger: (logLine) => {
      console.error(`Stagehand[${sessionId}]: ${logLine.message}`);
    },
  });

  await stagehand.init();
  return stagehand;
};

/**
 * SessionManager manages browser sessions and tracks active/default sessions.
 *
 * Session ID Strategy:
 * - Default session: Uses generated ID with timestamp and UUID for uniqueness
 * - User sessions: Uses raw sessionId provided by user (no suffix added)
 * - All sessions stored in this.browsers Map with their internal ID as key
 *
 * Note: Context.currentSessionId is a getter that delegates to this.getActiveSessionId()
 * to ensure session tracking stays synchronized.
 */

export class SessionManager {
  private browsers: Map<string, BrowserSession>;
  private defaultBrowserSession: BrowserSession | null;
  private readonly defaultSessionId: string;
  private activeSessionId: string;
  // Mutex to prevent race condition when multiple calls try to create default session simultaneously
  private defaultSessionCreationPromise: Promise<BrowserSession> | null = null;
  // Track sessions currently being cleaned up to prevent concurrent cleanup
  private cleaningUpSessions: Set<string> = new Set();

  constructor(contextId?: string) {
    this.browsers = new Map();
    this.defaultBrowserSession = null;
    const uniqueId = randomUUID();
    this.defaultSessionId = `browserbase_session_${contextId || "default"}_${Date.now()}_${uniqueId}`;
    this.activeSessionId = this.defaultSessionId;
  }

  getDefaultSessionId(): string {
    return this.defaultSessionId;
  }

  /**
   * Sets the active session ID.
   * @param id The ID of the session to set as active.
   */
  setActiveSessionId(id: string): void {
    if (this.browsers.has(id)) {
      this.activeSessionId = id;
    } else if (id === this.defaultSessionId) {
      // Allow setting to default ID even if session doesn't exist yet
      // (it will be created on first use via ensureDefaultSessionInternal)
      this.activeSessionId = id;
    } else {
      process.stderr.write(
        `[SessionManager] WARN - Set active session failed for non-existent ID: ${id}\n`,
      );
    }
  }

  /**
   * Gets the active session ID.
   * @returns The active session ID.
   */
  getActiveSessionId(): string {
    return this.activeSessionId;
  }

  /**
   * Creates a new Browserbase session using Stagehand.
   * @param newSessionId - Internal session ID for tracking in SessionManager
   * @param config - Configuration object
   * @param resumeSessionId - Optional Browserbase session ID to resume/reuse
   */
  async createNewBrowserSession(
    newSessionId: string,
    config: Config,
    resumeSessionId?: string,
  ): Promise<BrowserSession> {
    if (!config.browserbaseApiKey) {
      throw new Error("Browserbase API Key is missing in the configuration.");
    }
    if (!config.browserbaseProjectId) {
      throw new Error(
        "Browserbase Project ID is missing in the configuration.",
      );
    }

    try {
      process.stderr.write(
        `[SessionManager] ${resumeSessionId ? "Resuming" : "Creating"} Stagehand session ${newSessionId}...\n`,
      );

      // Create and initialize Stagehand instance using shared function
      const stagehand = await createStagehandInstance(
        config,
        {
          ...(resumeSessionId && { browserbaseSessionID: resumeSessionId }),
        },
        newSessionId,
      );

      const page = stagehand.context.pages()[0];
      if (!page) {
        throw new Error("No pages available in Stagehand context");
      }

      const browserbaseSessionId = stagehand.browserbaseSessionId;

      if (!browserbaseSessionId) {
        throw new Error(
          "Browserbase session ID is required but was not returned by Stagehand",
        );
      }

      process.stderr.write(
        `[SessionManager] Stagehand initialized with Browserbase session: ${browserbaseSessionId}\n`,
      );
      process.stderr.write(
        `[SessionManager] Browserbase Live Debugger URL: https://www.browserbase.com/sessions/${browserbaseSessionId}\n`,
      );

      const sessionObj: BrowserSession = {
        page,
        sessionId: browserbaseSessionId,
        stagehand,
      };

      this.browsers.set(newSessionId, sessionObj);

      if (newSessionId === this.defaultSessionId) {
        this.defaultBrowserSession = sessionObj;
      }

      this.setActiveSessionId(newSessionId);
      process.stderr.write(
        `[SessionManager] Session created and active: ${newSessionId}\n`,
      );

      return sessionObj;
    } catch (creationError) {
      const errorMessage =
        creationError instanceof Error
          ? creationError.message
          : String(creationError);
      process.stderr.write(
        `[SessionManager] Creating session ${newSessionId} failed: ${errorMessage}\n`,
      );
      throw new Error(
        `Failed to create/connect session ${newSessionId}: ${errorMessage}`,
      );
    }
  }

  private async closeBrowserGracefully(
    session: BrowserSession | undefined | null,
    sessionIdToLog: string,
  ): Promise<void> {
    // Check if this session is already being cleaned up
    if (this.cleaningUpSessions.has(sessionIdToLog)) {
      process.stderr.write(
        `[SessionManager] Session ${sessionIdToLog} is already being cleaned up, skipping.\n`,
      );
      return;
    }

    // Mark session as being cleaned up
    this.cleaningUpSessions.add(sessionIdToLog);

    try {
      // Close Stagehand instance which handles browser cleanup
      if (session?.stagehand) {
        try {
          process.stderr.write(
            `[SessionManager] Closing Stagehand for session: ${sessionIdToLog}\n`,
          );
          await session.stagehand.close();
          process.stderr.write(
            `[SessionManager] Successfully closed Stagehand and browser for session: ${sessionIdToLog}\n`,
          );
        } catch (closeError) {
          process.stderr.write(
            `[SessionManager] WARN - Error closing Stagehand for session ${sessionIdToLog}: ${
              closeError instanceof Error
                ? closeError.message
                : String(closeError)
            }\n`,
          );
        }
      }
    } finally {
      // Always remove from cleanup tracking set
      this.cleaningUpSessions.delete(sessionIdToLog);
    }
  }

  // Internal function to ensure default session
  // Uses a mutex pattern to prevent race conditions when multiple calls happen concurrently
  async ensureDefaultSessionInternal(config: Config): Promise<BrowserSession> {
    // If a creation is already in progress, wait for it instead of starting a new one
    if (this.defaultSessionCreationPromise) {
      process.stderr.write(
        `[SessionManager] Default session creation already in progress, waiting...\n`,
      );
      return await this.defaultSessionCreationPromise;
    }

    const sessionId = this.defaultSessionId;
    let needsReCreation = false;

    if (!this.defaultBrowserSession) {
      needsReCreation = true;
      process.stderr.write(
        `[SessionManager] Default session ${sessionId} not found, creating.\n`,
      );
    } else {
      try {
        // Try a simple operation to validate the session is alive
        const pages = this.defaultBrowserSession.stagehand.context.pages();
        if (!pages || pages.length === 0) {
          throw new Error("No pages available");
        }
      } catch {
        needsReCreation = true;
        process.stderr.write(
          `[SessionManager] Default session ${sessionId} is stale, recreating.\n`,
        );
        await this.closeBrowserGracefully(
          this.defaultBrowserSession,
          sessionId,
        );
        this.defaultBrowserSession = null;
        this.browsers.delete(sessionId);
      }
    }

    if (needsReCreation) {
      // Set the mutex promise before starting creation
      this.defaultSessionCreationPromise = (async () => {
        try {
          this.defaultBrowserSession = await this.createNewBrowserSession(
            sessionId,
            config,
          );
          return this.defaultBrowserSession;
        } catch (creationError) {
          // Error during initial creation or recreation
          process.stderr.write(
            `[SessionManager] Initial/Recreation attempt for default session ${sessionId} failed. Error: ${
              creationError instanceof Error
                ? creationError.message
                : String(creationError)
            }\n`,
          );
          // Attempt one more time after a failure
          process.stderr.write(
            `[SessionManager] Retrying creation of default session ${sessionId} after error...\n`,
          );
          try {
            this.defaultBrowserSession = await this.createNewBrowserSession(
              sessionId,
              config,
            );
            return this.defaultBrowserSession;
          } catch (retryError) {
            const finalErrorMessage =
              retryError instanceof Error
                ? retryError.message
                : String(retryError);
            process.stderr.write(
              `[SessionManager] Failed to recreate default session ${sessionId} after retry: ${finalErrorMessage}\n`,
            );
            throw new Error(
              `Failed to ensure default session ${sessionId} after initial error and retry: ${finalErrorMessage}`,
            );
          }
        } finally {
          // Clear the mutex after creation completes or fails
          this.defaultSessionCreationPromise = null;
        }
      })();

      return await this.defaultSessionCreationPromise;
    }

    // If we reached here, the existing default session is considered okay.
    this.setActiveSessionId(sessionId); // Ensure default is marked active
    return this.defaultBrowserSession!; // Non-null assertion: logic ensures it's not null here
  }

  // Get a specific session by ID
  async getSession(
    sessionId: string,
    config: Config,
    createIfMissing: boolean = true,
  ): Promise<BrowserSession | null> {
    if (sessionId === this.defaultSessionId && createIfMissing) {
      try {
        return await this.ensureDefaultSessionInternal(config);
      } catch {
        process.stderr.write(
          `[SessionManager] Failed to get default session due to error in ensureDefaultSessionInternal for ${sessionId}. See previous messages for details.\n`,
        );
        return null;
      }
    }

    // For non-default sessions
    process.stderr.write(`[SessionManager] Getting session: ${sessionId}\n`);
    const sessionObj = this.browsers.get(sessionId);

    if (!sessionObj) {
      process.stderr.write(
        `[SessionManager] WARN - Session not found in map: ${sessionId}\n`,
      );
      return null;
    }

    try {
      const pages = sessionObj.stagehand.context.pages();
      if (!pages || pages.length === 0) {
        throw new Error("No pages available");
      }
    } catch {
      process.stderr.write(
        `[SessionManager] WARN - Found session ${sessionId} is stale, removing.\n`,
      );
      await this.closeBrowserGracefully(sessionObj, sessionId);
      this.browsers.delete(sessionId);
      if (this.activeSessionId === sessionId) {
        process.stderr.write(
          `[SessionManager] WARN - Invalidated active session ${sessionId}, resetting to default.\n`,
        );
        this.setActiveSessionId(this.defaultSessionId);
      }
      return null;
    }

    // Session appears valid, make it active
    this.setActiveSessionId(sessionId);
    process.stderr.write(
      `[SessionManager] Using valid session: ${sessionId}\n`,
    );
    return sessionObj;
  }

  /**
   * Clean up a session by closing the browser and removing it from tracking.
   * This method handles both closing Stagehand and cleanup, and is idempotent.
   *
   * @param sessionId The session ID to clean up
   */
  async cleanupSession(sessionId: string): Promise<void> {
    process.stderr.write(
      `[SessionManager] Cleaning up session: ${sessionId}\n`,
    );

    // Get the session to close it gracefully
    const session = this.browsers.get(sessionId);
    if (session) {
      await this.closeBrowserGracefully(session, sessionId);
    }

    // Remove from browsers map
    this.browsers.delete(sessionId);

    // Clear default session reference if this was the default
    if (sessionId === this.defaultSessionId && this.defaultBrowserSession) {
      this.defaultBrowserSession = null;
    }

    // Reset active session to default if this was the active one
    if (this.activeSessionId === sessionId) {
      process.stderr.write(
        `[SessionManager] Cleaned up active session ${sessionId}, resetting to default.\n`,
      );
      this.setActiveSessionId(this.defaultSessionId);
    }
  }

  // Function to close all managed browser sessions gracefully
  async closeAllSessions(): Promise<void> {
    process.stderr.write(`[SessionManager] Closing all sessions...\n`);
    const closePromises: Promise<void>[] = [];
    for (const [id, session] of this.browsers.entries()) {
      process.stderr.write(`[SessionManager] Closing session: ${id}\n`);
      closePromises.push(
        // Use the helper for consistent logging/error handling
        this.closeBrowserGracefully(session, id),
      );
    }
    try {
      await Promise.all(closePromises);
    } catch {
      // Individual errors are caught and logged by closeBrowserGracefully
      process.stderr.write(
        `[SessionManager] WARN - Some errors occurred during batch session closing. See individual messages.\n`,
      );
    }

    this.browsers.clear();
    this.defaultBrowserSession = null;
    this.setActiveSessionId(this.defaultSessionId); // Reset active session to default
    process.stderr.write(`[SessionManager] All sessions closed and cleared.\n`);
  }
}
