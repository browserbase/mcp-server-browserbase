import {
  chromium,
  Browser,
  Page,
  errors as PlaywrightErrors,
} from "playwright-core";
import { Browserbase } from "@browserbasehq/sdk";
import type { Config } from "../config.js"; // Import Config type

// Define the type for a session object
export type BrowserSession = { browser: Browser; page: Page };

// Global state for managing browser sessions
const browsers = new Map<string, BrowserSession>();
// Keep track of the default session explicitly
let defaultBrowserSession: BrowserSession | null = null;
const defaultSessionId = "default"; // Consistent ID for the default session

// Default Configuration 
let currentConfig: Config = { proxies: false };

// Function to set configuration
function setConfig(config: Config) {
  currentConfig = { ...currentConfig, ...config };
  console.error(`Updated configuration: proxies=${currentConfig.proxies}`);
}

// Helper Functions

// Function to create a new browser session
async function createNewBrowserSession(
  newSessionId: string,
  config?: Config,
): Promise<BrowserSession> {
  const bb = new Browserbase({
    // Use config values instead of process.env
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });

  // Use passed config or fall back to global config
  const sessionConfig = config || currentConfig;

  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    proxies: sessionConfig.proxies, // Use config value
  });

  const browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 60000 });

  // Handle unexpected disconnects
  browser.on("disconnected", () => {
    browsers.delete(newSessionId);
    // If the disconnected browser was the default one, clear the global reference
    if (defaultBrowserSession && defaultBrowserSession.browser === browser) {
      defaultBrowserSession = null;
    }
  });

  let context = browser.contexts()[0];
  if (!context) {
    context = await browser.newContext();
  }
  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  const sessionObj: BrowserSession = { browser, page };

  // Store the session
  browsers.set(newSessionId, sessionObj);

  // If this is the default session, update the global reference
  if (newSessionId === defaultSessionId) {
    defaultBrowserSession = sessionObj;
  }

  return sessionObj;
}

// Internal function to ensure default session, passes config down
async function ensureDefaultSessionInternal(config: Config): Promise<BrowserSession> {
  const sessionId = defaultSessionId;
  try {
    if (!defaultBrowserSession) {
      defaultBrowserSession = await createNewBrowserSession(sessionId, config); // Pass config
      return defaultBrowserSession;
    }

    if (
      !defaultBrowserSession.browser.isConnected() ||
      defaultBrowserSession.page.isClosed()
    ) {
      try {
        await defaultBrowserSession.browser.close();
      } catch (closeError) {
      } finally {
        defaultBrowserSession = null;
        browsers.delete(sessionId);
      }
      defaultBrowserSession = await createNewBrowserSession(sessionId, config); // Pass config
      return defaultBrowserSession;
    }

    try {
      await defaultBrowserSession.page.title();
      return defaultBrowserSession;
    } catch (error) {
      // Check for Playwright-specific errors indicating a closed/invalid session
      const isDisconnectedError =
        error instanceof Error &&
        (error.message.includes("Target closed") ||
          error.message.includes("Browser has been closed") ||
          error.message.includes("connect ECONNREFUSED") ||
          error.message.includes("Page is closed"));
      const isTimeoutError = error instanceof PlaywrightErrors.TimeoutError;

      if (isDisconnectedError || isTimeoutError) {
        try {
          if (defaultBrowserSession && defaultBrowserSession.browser.isConnected()) {
            await defaultBrowserSession.browser.close();
          }
        } catch (e) {
        } finally {
          defaultBrowserSession = null;
          browsers.delete(sessionId);
        }
        // Create a completely new session
        defaultBrowserSession = await createNewBrowserSession(sessionId, config); // Pass config
        return defaultBrowserSession;
      } else {
        throw error;
      }
    }
  } catch (error) {
    // Attempt recovery if it seems like a connection issue
    if ( error instanceof Error &&
        (error.message.includes("Target closed") ||
          error.message.includes("connect ECONNREFUSED") ||
          error.message.includes("Page is closed")))
          {
              browsers.clear(); // Clear all tracked sessions
              defaultBrowserSession = null;
              await new Promise((resolve) => setTimeout(resolve, 1000));
              try {
                  defaultBrowserSession = await createNewBrowserSession(sessionId, config); // Pass config
                  return defaultBrowserSession;
              } catch(retryError) {
                  throw retryError; // Throw the error from the retry attempt
              }
          }
    throw error; // Re-throw original error if not a recognized recoverable error or recovery failed
  }
}

// Get a specific session by ID, needs config to create/recover default
export async function getSession(sessionId: string, config: Config): Promise<BrowserSession | null> {
    if (sessionId === defaultSessionId) {
        try {
            return await ensureDefaultSessionInternal(config); // Pass config
        } catch (error) {
            return null;
        }
    }

    // For non-default sessions, config isn't strictly needed unless we add recreation logic
    let sessionObj = browsers.get(sessionId);
    if (!sessionObj) {
        return null;
    }

    // Validate the found session (recreation logic for non-default not added here)
    try {
        if (!sessionObj.browser.isConnected() || sessionObj.page.isClosed()) {
            try { await sessionObj.browser.close(); } catch (e) {} // Attempt cleanup
            browsers.delete(sessionId);
            return null;
        }
        // Perform a quick check
        await sessionObj.page.title();
        return sessionObj; // Session valid
    } catch (validationError) {
        try { await sessionObj.browser.close(); } catch (e) {} // Attempt cleanup
        browsers.delete(sessionId);
        return null; // Session invalid after validation failure
    }
}

// Function to close all managed browser sessions gracefully
export async function closeAllSessions(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const [id, session] of browsers.entries()) {
    if (session.browser) {
      closePromises.push(
        session.browser.close().then(() => {
        }).catch(e => {
        })
      );
    }
  }
  browsers.clear();
  defaultBrowserSession = null;
  console.error("Browser sessions closed.");
}