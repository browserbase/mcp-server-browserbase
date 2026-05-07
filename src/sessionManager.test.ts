import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "../config.d.ts";

const stagehandMock = vi.hoisted(() => {
  return {
    constructor: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@browserbasehq/stagehand", () => {
  return {
    Stagehand: stagehandMock.constructor.mockImplementation(function (options) {
      return {
        init: stagehandMock.init,
        context: {
          pages: () => [{ id: "test-page" }],
        },
        browserbaseSessionId: "bb-session-id",
        connectURL: () => "wss://connect.example.test",
        close: vi.fn().mockResolvedValue(undefined),
        __options: options,
      };
    }),
  };
});

describe("createStagehandInstance model gateway behavior", () => {
  beforeEach(() => {
    stagehandMock.constructor.mockClear();
    stagehandMock.init.mockClear();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  it("uses Browserbase model gateway when modelName is set and modelApiKey is omitted", async () => {
    const { createStagehandInstance } = await import("./sessionManager.js");
    const config: Config = {
      browserbaseApiKey: "bb-test-key",
      browserbaseProjectId: "test-project",
      modelName: "openai/gpt-4.1",
    };

    await createStagehandInstance(config, {}, "test-session-id");

    expect(stagehandMock.constructor).toHaveBeenCalledOnce();
    expect(stagehandMock.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        env: "BROWSERBASE",
        apiKey: "bb-test-key",
        projectId: "test-project",
        model: {
          modelName: "gateway/openai/gpt-4.1",
          apiKey: "bb-test-key",
        },
      }),
    );
  });

  it("prefers an explicit modelApiKey over Browserbase model gateway", async () => {
    const { createStagehandInstance } = await import("./sessionManager.js");
    const config: Config = {
      browserbaseApiKey: "bb-test-key",
      browserbaseProjectId: "test-project",
      modelName: "openai/gpt-4.1",
      modelApiKey: "sk-provider-key",
    };

    await createStagehandInstance(config, {}, "test-session-id");

    expect(stagehandMock.constructor).toHaveBeenCalledOnce();
    expect(stagehandMock.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        model: {
          modelName: "openai/gpt-4.1",
          apiKey: "sk-provider-key",
        },
      }),
    );
  });
});
