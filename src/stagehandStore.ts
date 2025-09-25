import { randomUUID } from "crypto";
import { Stagehand, Page } from "@browserbasehq/stagehand";
import { StagehandSession, CreateSessionParams } from "./types/types.js";
import type { Config } from "../config.d.ts";
import { clearScreenshotsForSession } from "./mcp/resources.js";

// Store for all active sessions
const store = new Map<string, StagehandSession>();

/**
 * Create a configured Stagehand instance
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

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey,
    projectId,
    modelName:
      params.modelName || config.modelName || "google/gemini-2.0-flash",
    modelClientOptions: {
      apiKey: config.modelApiKey || process.env.GEMINI_API_KEY,
    },
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
          width: config.viewPort?.browserWidth ?? 1024,
          height: config.viewPort?.browserHeight ?? 768,
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
 * Create a new Stagehand session
 */
export const create = async (
  config: Config,
  params: CreateSessionParams = {},
): Promise<StagehandSession> => {
  // Global ID, must be 100% Unique
  const id = randomUUID() + "_" + config.browserbaseProjectId;

  process.stderr.write(`[StagehandStore] Creating new session ${id}...\n`);

  const stagehand = await createStagehandInstance(config, params, id);

  const page = stagehand.page as unknown as Page;
  const browser = page.context().browser();

  if (!browser) {
    throw new Error("Failed to get browser from Stagehand page context");
  }

  const session: StagehandSession = {
    id,
    stagehand,
    page,
    browser,
    created: Date.now(),
    metadata: {
      ...params.meta,
      bbSessionId: stagehand.browserbaseSessionID,
    },
  };

  store.set(id, session);

  process.stderr.write(
    `[StagehandStore] Session created: ${id} (BB: ${stagehand.browserbaseSessionID})\n`,
  );
  process.stderr.write(
    `[StagehandStore] Live debugger: https://www.browserbase.com/sessions/${stagehand.browserbaseSessionID}\n`,
  );

  // Set up disconnect handler
  const disconnectHandler = () => {
    process.stderr.write(`[StagehandStore] Session disconnected: ${id}\n`);
    store.delete(id);
    // Purge by internal store ID and Browserbase session ID
    try {
      clearScreenshotsForSession(id);
      const bbId = session.metadata?.bbSessionId;
      if (bbId) {
        clearScreenshotsForSession(bbId);
      }
    } catch {
      process.stderr.write(
        `[StagehandStore] Error clearing screenshots for session ${id}\n`,
      );
    }
  };

  browser.on("disconnected", disconnectHandler);

  // Store the handler for cleanup
  session.metadata = {
    ...session.metadata,
    disconnectHandler,
  };

  return session;
};

/**
 * Get a session by ID
 */
export const get = (id: string): StagehandSession | null => {
  return store.get(id) ?? null;
};

/**
 * List all active sessions
 */
export const list = (): StagehandSession[] => {
  return Array.from(store.values());
};

/**
 * Remove and close a session
 */
export const remove = async (id: string): Promise<void> => {
  const session = store.get(id);
  if (!session) {
    process.stderr.write(
      `[StagehandStore] Session not found for removal: ${id}\n`,
    );
    return;
  }

  process.stderr.write(`[StagehandStore] Removing session: ${id}\n`);

  try {
    if (session.metadata?.disconnectHandler) {
      session.browser.off("disconnected", session.metadata.disconnectHandler);
    }

    await session.stagehand.close();
    process.stderr.write(`[StagehandStore] Session closed: ${id}\n`);
    // Purge by internal store ID and Browserbase session ID
    try {
      clearScreenshotsForSession(id);
      const bbId = session.metadata?.bbSessionId;
      if (bbId) {
        clearScreenshotsForSession(bbId);
      }
    } catch {
      process.stderr.write(
        `[StagehandStore] Error clearing screenshots for session ${id}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(
      `[StagehandStore] Error closing session ${id}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  } finally {
    store.delete(id);
  }
};

/**
 * Remove all sessions
 */
export const removeAll = async (): Promise<void> => {
  process.stderr.write(
    `[StagehandStore] Removing all ${store.size} sessions...\n`,
  );
  await Promise.all(list().map((s) => remove(s.id)));
  process.stderr.write(`[StagehandStore] All sessions removed\n`);
};

/**
 * Get store size
 */
export const size = (): number => {
  return store.size;
};
