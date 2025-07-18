import { randomUUID } from "crypto";
import type { Config } from "../../config.d.ts";
import { StagehandSession, CreateSessionParams } from "../types/types.js";
import { StagehandAdapter } from "./StagehandAdapter.js";

/**
 * SessionStore manages the lifecycle of Stagehand sessions
 * Provides CRUD operations for session management
 */
export class SessionStore {
  private store = new Map<string, StagehandSession>();
  private config: Config;
  private logger: (message: string) => void;

  constructor(
    config: Config,
    logger: (message: string) => void = console.error,
  ) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Create a new session
   */
  async create(opts: CreateSessionParams = {}): Promise<StagehandSession> {
    // Generate unique session ID
    const id = randomUUID() + "_" + this.config.browserbaseProjectId;

    this.logger(`[SessionStore] Creating new session ${id}...`);

    try {
      // Launch Stagehand instance using adapter
      const session = await StagehandAdapter.launch(this.config, opts, id);

      // Store the session
      this.store.set(id, session);

      this.logger(
        `[SessionStore] Session created: ${id} (BB: ${session.metadata?.bbSessionId})`,
      );
      this.logger(
        `[SessionStore] Live debugger: https://www.browserbase.com/sessions/${session.metadata?.bbSessionId}`,
      );

      // Set up disconnect handler
      const disconnectHandler = () => {
        this.logger(`[SessionStore] Session disconnected: ${id}`);
        this.store.delete(id);
      };

      session.browser.on("disconnected", disconnectHandler);

      // Store the handler for cleanup
      session.metadata = {
        ...session.metadata,
        disconnectHandler,
      };

      return session;
    } catch (error) {
      this.logger(
        `[SessionStore] Failed to create session ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * Get a session by ID
   */
  get(id: string): StagehandSession | null {
    return this.store.get(id) ?? null;
  }

  /**
   * List all active sessions
   */
  list(): StagehandSession[] {
    return Array.from(this.store.values());
  }

  /**
   * Remove and close a session
   */
  async remove(id: string): Promise<void> {
    const session = this.store.get(id);
    if (!session) {
      this.logger(`[SessionStore] Session not found for removal: ${id}`);
      return;
    }

    this.logger(`[SessionStore] Removing session: ${id}`);

    try {
      if (session.metadata?.disconnectHandler) {
        session.browser.off("disconnected", session.metadata.disconnectHandler);
      }

      await session.stagehand.close();
      this.logger(`[SessionStore] Session closed: ${id}`);
    } catch (error) {
      this.logger(
        `[SessionStore] Error closing session ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.store.delete(id);
    }
  }

  /**
   * Remove all sessions
   */
  async removeAll(): Promise<void> {
    this.logger(`[SessionStore] Removing all ${this.store.size} sessions...`);
    await Promise.all(this.list().map((s) => this.remove(s.id)));
    this.logger(`[SessionStore] All sessions removed`);
  }

  /**
   * Get store size
   */
  size(): number {
    return this.store.size;
  }
}
