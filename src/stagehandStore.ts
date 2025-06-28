import { randomUUID } from "crypto";
import { Stagehand, AvailableModel } from "@browserbasehq/stagehand";
import { Page } from "playwright-core";
import { StagehandSession, CreateSessionParams } from "./types/types.js";
import type { Config } from "../config.js";

// Store for all active sessions
const store = new Map<string, StagehandSession>();

/**
 * Create a new Stagehand session
 */
export const create = async (
  config: Config,
  params: CreateSessionParams = {},
): Promise<StagehandSession> => {
  const id = randomUUID() + "_" + Date.now();

  // Merge config with params
  const apiKey = params.apiKey || config.browserbaseApiKey;
  const projectId = params.projectId || config.browserbaseProjectId;

  if (!apiKey || !projectId) {
    throw new Error("Browserbase API Key and Project ID are required");
  }

  process.stderr.write(`[StagehandStore] Creating new session ${id}...\n`);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey,
    projectId,
    modelName: (params.modelName ||
      config.modelName ||
      "google/gemini-2.0-flash") as AvailableModel,
    modelClientOptions: {
      apiKey: process.env.GEMINI_API_KEY, //TODO:
    },
    ...(params.browserbaseSessionID && {
      browserbaseSessionID: params.browserbaseSessionID,
    }),
    browserbaseSessionCreateParams: params.browserbaseSessionCreateParams || {
      projectId,
      proxies: config.proxies,
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
    },
    logger: (logLine) => {
      console.error(`Stagehand[${id}]: ${logLine.message}`);
    },
  });

  await stagehand.init();

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
  browser.on("disconnected", () => {
    process.stderr.write(`[StagehandStore] Session disconnected: ${id}\n`);
    store.delete(id);
  });

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
    await session.stagehand.close();
    process.stderr.write(`[StagehandStore] Session closed: ${id}\n`);
  } catch (error) {
    process.stderr.write(
      `[StagehandStore] Error closing session ${id}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }

  store.delete(id);
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
