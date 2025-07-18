import { Stagehand, Page } from "@browserbasehq/stagehand";
import type { Config } from "../../config.d.ts";
import { CreateSessionParams, StagehandSession } from "../types/types.js";

/**
 * Core adapter for launching Stagehand instances
 * Handles the initialization and configuration of Stagehand with Browserbase
 */
export class StagehandAdapter {
  /**
   * Launch a new Stagehand instance with the given configuration and parameters
   */
  static async launch(
    config: Config,
    params: CreateSessionParams = {},
    sessionId: string,
  ): Promise<StagehandSession> {
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
      browserbaseSessionCreateParams: {
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
        console.error(`Stagehand[${sessionId}]: ${logLine.message}`);
      },
    });

    await stagehand.init();

    const page = stagehand.page as unknown as Page;
    const browser = page.context().browser();

    if (!browser) {
      throw new Error("Failed to get browser from Stagehand page context");
    }

    return {
      id: sessionId,
      stagehand,
      page,
      browser,
      created: Date.now(),
      metadata: {
        ...params.meta,
        bbSessionId: stagehand.browserbaseSessionID,
      },
    };
  }
}
