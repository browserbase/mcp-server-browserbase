import {
  chromium,
  Browser,
  Page,
} from "playwright-core";
import { Browserbase } from "@browserbasehq/sdk";
import type { Config } from "../config.js"; 
import { SessionCreateParams } from "@browserbasehq/sdk/src/resources/sessions/sessions.js";
import type { Cookie } from "playwright-core";

// Define the type for a session object
export type BrowserSession = {
  browser: Browser;
  page: Page;
  sessionId: string;
};

// Global state for managing browser sessions
const browsers = new Map<string, BrowserSession>();

// Keep track of the default session explicitly
let defaultBrowserSession: BrowserSession | null = null;

// Define a specific ID for the default session
export const defaultSessionId = "browserbase_session_main";

// Keep track of the active session ID. Defaults to the main session.
let activeSessionId: string = defaultSessionId;

/**
 * Sets the active session ID.
 * @param id The ID of the session to set as active.
 */
export function setActiveSessionId(id: string): void {
  if (browsers.has(id) || id === defaultSessionId) {
    activeSessionId = id;
  } else {
    process.stderr.write(
      `[SessionManager] WARN - Set active session failed for non-existent ID: ${id}\n`
    );
  }
}

/**
 * Gets the active session ID.
 * @returns The active session ID.
 */
export function getActiveSessionId(): string {
  return activeSessionId;
}

/**
 * Adds cookies to a browser context
 * @param context Playwright browser context
 * @param cookies Array of cookies to add
 */
export async function addCookiesToContext(context: any, cookies: Cookie[]): Promise<void> {
  if (!cookies || cookies.length === 0) {
    return;
  }
  
  try {
    process.stderr.write(`[SessionManager] Adding ${cookies.length} cookies to browser context\n`);
    await context.addCookies(cookies);
    process.stderr.write(`[SessionManager] Successfully added cookies to browser context\n`);
  } catch (error) {
    process.stderr.write(
      `[SessionManager] Error adding cookies to browser context: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
  }
}

// Function to create a new Browserbase session and connect Playwright
export async function createNewBrowserSession(
  newSessionId: string,
  config: Config, 
): Promise<BrowserSession> {
  if (!config.browserbaseApiKey) {
    throw new Error("Browserbase API Key is missing in the configuration.");
  }
  if (!config.browserbaseProjectId) {
    throw new Error("Browserbase Project ID is missing in the configuration.");
  }

  const bb = new Browserbase({
    apiKey: config.browserbaseApiKey,
  });

  // Prepare session creation options
  const sessionOptions: SessionCreateParams = {
    // Use non-null assertion after check
    projectId: config.browserbaseProjectId!,
    proxies: config.proxies, 
    browserSettings: {
      viewport: {
        width: config.viewPort?.browserWidth ?? 1024,
        height: config.viewPort?.browserHeight ?? 768,
      },
      context: config.context?.contextId ? {
        id: config.context?.contextId,
        persist: config.context?.persist ?? true,
      } : undefined,
      advancedStealth: config.advancedStealth ?? undefined,
    }
  };

  try {
    process.stderr.write(
      `[SessionManager] Creating session ${newSessionId}...\n`
    );
    const bbSession = await bb.sessions.create(sessionOptions);
    process.stderr.write(
      `[SessionManager] Browserbase session created: ${bbSession.id}\n`
    );

    const browser = await chromium.connectOverCDP(bbSession.connectUrl);
    process.stderr.write(
      `[SessionManager] Browserbase Live Debugger URL: https://www.browserbase.com/sessions/${bbSession.id}\n`
    );

    browser.on("disconnected", () => {
      process.stderr.write(`[SessionManager] Disconnected: ${newSessionId}\n`);
      browsers.delete(newSessionId);
      if (defaultBrowserSession && defaultBrowserSession.browser === browser) {
        process.stderr.write(
          `[SessionManager] Disconnected (default): ${newSessionId}\n`
        );
        defaultBrowserSession = null;
      }
      if (
        activeSessionId === newSessionId &&
        newSessionId !== defaultSessionId
      ) {
        process.stderr.write(
          `[SessionManager] WARN - Active session disconnected, resetting to default: ${newSessionId}\n`
        );
        setActiveSessionId(defaultSessionId);
      }
    });

    let context = browser.contexts()[0];
    if (!context) {
      context = await browser.newContext();
    }
    
    // Add cookies to the context if they are provided in the config
    if (config.cookies && Array.isArray(config.cookies) && config.cookies.length > 0) {
      await addCookiesToContext(context, config.cookies);
    }
    
    let page = context.pages()[0];
    if (!page) {
      page = await context.newPage();
    }

    const sessionObj: BrowserSession = {
      browser,
      page,
      sessionId: bbSession.id, 
    };

    browsers.set(newSessionId, sessionObj);

    if (newSessionId === defaultSessionId) {
      defaultBrowserSession = sessionObj;
    }

    setActiveSessionId(newSessionId);
    process.stderr.write(
      `[SessionManager] Session created and active: ${newSessionId}\n`
    );

    return sessionObj;
  } catch (creationError) {
    const errorMessage =
      creationError instanceof Error
        ? creationError.message
        : String(creationError);
    process.stderr.write(
      `[SessionManager] Creating session ${newSessionId} failed: ${
        creationError instanceof Error
          ? creationError.message
          : String(creationError)
      }`
    ); 
    throw new Error(
      `Failed to create/connect session ${newSessionId}: ${errorMessage}`
    );
  }
}

async function closeBrowserGracefully(
  session: BrowserSession | undefined | null,
  sessionIdToLog: string
): Promise<void> {
  if (session?.browser?.isConnected()) {
    process.stderr.write(
      `[SessionManager] Closing browser for session: ${sessionIdToLog}\n`
    );
    try {
      await session.browser.close();
    } catch (closeError) {
      process.stderr.write(
        `[SessionManager] WARN - Error closing browser for session ${sessionIdToLog}: ${
          closeError instanceof Error ? closeError.message : String(closeError)
        }\n`
      );
    }
  }
}

// Internal function to ensure default session
export async function ensureDefaultSessionInternal(
  config: Config
): Promise<BrowserSession> {
  const sessionId = defaultSessionId;
  let needsRecreation = false;

  if (!defaultBrowserSession) {
    needsRecreation = true;
    process.stderr.write(
      `[SessionManager] Default session ${sessionId} not found, creating.\n`
    );
  } else if (
    !defaultBrowserSession.browser.isConnected() ||
    defaultBrowserSession.page.isClosed()
  ) {
    needsRecreation = true;
    process.stderr.write(
      `[SessionManager] Default session ${sessionId} is stale, recreating.\n`
    );
    await closeBrowserGracefully(defaultBrowserSession, sessionId);
    defaultBrowserSession = null;
    browsers.delete(sessionId);
  }

  if (needsRecreation) {
    try {
      defaultBrowserSession = await createNewBrowserSession(sessionId, config);
      return defaultBrowserSession;
    } catch (error) {
      // Error during initial creation or recreation
      process.stderr.write(
        `[SessionManager] Initial/Recreation attempt for default session ${sessionId} failed. Error: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
      // Attempt one more time after a failure
      process.stderr.write(
        `[SessionManager] Retrying creation of default session ${sessionId} after error...\n`
      );
      try {
        defaultBrowserSession = await createNewBrowserSession(sessionId, config);
        return defaultBrowserSession;
      } catch (retryError) {
        const finalErrorMessage =
          retryError instanceof Error
            ? retryError.message
            : String(retryError);
        process.stderr.write(
          `[SessionManager] Failed to recreate default session ${sessionId} after retry: ${finalErrorMessage}\n`
        );
        throw new Error(
          `Failed to ensure default session ${sessionId} after initial error and retry: ${finalErrorMessage}`
        );
      }
    }
  }

  // If we reached here, the existing default session is considered okay.
  setActiveSessionId(sessionId); // Ensure default is marked active
  return defaultBrowserSession!; // Non-null assertion: logic ensures it's not null here
}

// Get a specific session by ID
export async function getSession(
  sessionId: string,
  config: Config
): Promise<BrowserSession | null> {
  if (sessionId === defaultSessionId) {
    try {
      return await ensureDefaultSessionInternal(config);
    } catch (error) {
      // ensureDefaultSessionInternal already logs extensively
      process.stderr.write(
        `[SessionManager] Failed to get default session due to error in ensureDefaultSessionInternal for ${sessionId}. See previous messages for details.\n`
      );
      return null; // Or rethrow if getSession failing for default is critical
    }
  }

  // For non-default sessions
  process.stderr.write(`[SessionManager] Getting session: ${sessionId}\n`);
  let sessionObj = browsers.get(sessionId);

  if (!sessionObj) {
    process.stderr.write(
      `[SessionManager] WARN - Session not found in map: ${sessionId}\n`
    );
    return null;
  }

  // Validate the found session
  if (!sessionObj.browser.isConnected() || sessionObj.page.isClosed()) {
    process.stderr.write(
      `[SessionManager] WARN - Found session ${sessionId} is stale, removing.\n`
    );
    await closeBrowserGracefully(sessionObj, sessionId);
    browsers.delete(sessionId);
    if (activeSessionId === sessionId) {
      process.stderr.write(
        `[SessionManager] WARN - Invalidated active session ${sessionId}, resetting to default.\n`
      );
      setActiveSessionId(defaultSessionId);
    }
    return null;
  }

  // Session appears valid, make it active
  setActiveSessionId(sessionId);
  process.stderr.write(`[SessionManager] Using valid session: ${sessionId}\n`);
  return sessionObj;
}

// Function to close all managed browser sessions gracefully
export async function closeAllSessions(): Promise<void> {
  process.stderr.write(`[SessionManager] Closing all sessions...\n`);
  const closePromises: Promise<void>[] = [];
  for (const [id, session] of browsers.entries()) {
    process.stderr.write(`[SessionManager] Closing session: ${id}\n`);
    closePromises.push(
      // Use the helper for consistent logging/error handling
      closeBrowserGracefully(session, id)
    );
  }
  try {
    await Promise.all(closePromises);
  } catch(e) {
    // Individual errors are caught and logged by closeBrowserGracefully
    process.stderr.write(
      `[SessionManager] WARN - Some errors occurred during batch session closing. See individual messages.\n`
    );
  }

  browsers.clear();
  defaultBrowserSession = null;
  setActiveSessionId(defaultSessionId); // Reset active session to default
  process.stderr.write(`[SessionManager] All sessions closed and cleared.\n`);
}
