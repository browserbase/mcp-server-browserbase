import { describe, expect, it } from "vitest";

import { configFromCLIOptions, normalizeVerifiedConfig } from "./config.js";
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
