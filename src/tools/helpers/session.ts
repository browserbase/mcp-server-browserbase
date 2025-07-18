import { SessionStore } from "../../sessions/SessionStore.js";
import { defaultLogger } from "../../utils/logger.js";
import { StagehandSession, CreateSessionParams } from "../../types/types.js";
import type { Config } from "../../../config.d.ts";
import type { Context } from "../../context.js";

/**
 * Singleton session store instance
 * This provides a global access point to session management
 */
let store: SessionStore | null = null;

/**
 * Initialize or get the singleton store instance
 */
function getStore(config: Config): SessionStore {
  if (!store) {
    store = new SessionStore(config, defaultLogger);
  }
  return store;
}

/**
 * Helper function to work with sessions
 * If no sessionId is provided, creates a new session
 * If sessionId is provided, retrieves existing session or creates new one
 */
export async function withSession(
  context: Context,
  sessionId?: string,
  opts: CreateSessionParams = {},
): Promise<StagehandSession> {
  const sessionStore = getStore(context.config);

  if (sessionId) {
    // Try to get existing session
    const existingSession = sessionStore.get(sessionId);
    if (existingSession) {
      return existingSession;
    }

    // If session doesn't exist, create it with the specified ID
    // Note: We'll need to modify SessionStore.create to accept a custom ID
    throw new Error(
      `Session ${sessionId} not found and cannot create with custom ID`,
    );
  }

  // Create new session
  return await sessionStore.create(opts);
}

/**
 * Export the singleton store getter for direct access
 */
export { getStore as store };
