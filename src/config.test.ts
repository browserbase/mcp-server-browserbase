import { describe, expect, it } from "vitest";

import {
  configFromCLIOptions,
  normalizeVerifiedConfig,
  resolveConfig,
} from "./config.js";
import { configSchema } from "./index.js";

describe("verified config compatibility", () => {
  it("maps the legacy CLI advancedStealth alias to verified", async () => {
    const config = await configFromCLIOptions({ advancedStealth: true });

    expect(config.verified).toBe(true);
  });

  it("prefers verified when both verified and advancedStealth are set", () => {
    const config = normalizeVerifiedConfig({
      browserbaseApiKey: "test-key",
      browserbaseProjectId: "test-project",
      verified: false,
      advancedStealth: true,
    });

    expect(config.verified).toBe(false);
  });

  it("accepts advancedStealth in the Smithery config schema", () => {
    const config = configSchema.parse({
      browserbaseApiKey: "test-key",
      browserbaseProjectId: "test-project",
      advancedStealth: true,
    });

    expect(config.advancedStealth).toBe(true);
  });
});

describe("model gateway config", () => {
  it("accepts a provider/model modelName without modelApiKey", () => {
    const config = configSchema.parse({
      browserbaseApiKey: "test-key",
      browserbaseProjectId: "test-project",
      modelName: "openai/gpt-4.1",
    });

    expect(config.modelName).toBe("openai/gpt-4.1");
    expect(config.modelApiKey).toBeUndefined();
  });

  it("keeps modelApiKey undefined when no provider key is configured", async () => {
    const originalGeminiApiKey = process.env.GEMINI_API_KEY;
    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    const originalBrowserbaseApiKey = process.env.BROWSERBASE_API_KEY;
    const originalBrowserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;

    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.BROWSERBASE_API_KEY = "test-browserbase-key";
    process.env.BROWSERBASE_PROJECT_ID = "test-project";

    try {
      const config = await resolveConfig({
        modelName: "openai/gpt-4.1",
      });

      expect(config.modelName).toBe("openai/gpt-4.1");
      expect(config.modelApiKey).toBeUndefined();
    } finally {
      if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalGeminiApiKey;

      if (originalGoogleApiKey === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = originalGoogleApiKey;

      if (originalBrowserbaseApiKey === undefined) {
        delete process.env.BROWSERBASE_API_KEY;
      } else {
        process.env.BROWSERBASE_API_KEY = originalBrowserbaseApiKey;
      }

      if (originalBrowserbaseProjectId === undefined) {
        delete process.env.BROWSERBASE_PROJECT_ID;
      } else {
        process.env.BROWSERBASE_PROJECT_ID = originalBrowserbaseProjectId;
      }
    }
  });
});
