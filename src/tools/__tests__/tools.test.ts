import { describe, it, expect } from "vitest";
import { TOOLS } from "../index.js";

const EXPECTED_NAMES = [
  "start",
  "end",
  "navigate",
  "act",
  "observe",
  "extract",
];

const tool = (name: string) => TOOLS.find((t) => t.schema.name === name)!;

describe("TOOLS array", () => {
  it("exports exactly 6 tools", () => {
    expect(TOOLS).toHaveLength(6);
  });

  it("has correct tool names matching hosted MCP", () => {
    const names = TOOLS.map((t) => t.schema.name);
    expect(names).toEqual(EXPECTED_NAMES);
  });

  it("does not contain removed tools", () => {
    const names = TOOLS.map((t) => t.schema.name);
    for (const removed of [
      "screenshot",
      "get_url",
      "agent",
      "browserbase_session_create",
      "browserbase_session_close",
      "browserbase_stagehand_navigate",
      "browserbase_stagehand_act",
      "browserbase_stagehand_observe",
      "browserbase_stagehand_extract",
      "browserbase_screenshot",
      "browserbase_stagehand_get_url",
      "browserbase_stagehand_agent",
    ]) {
      expect(names).not.toContain(removed);
    }
  });
});

describe("tool input schemas", () => {
  it("start accepts empty params", () => {
    expect(tool("start").schema.inputSchema.safeParse({}).success).toBe(true);
  });

  it("end accepts empty params", () => {
    expect(tool("end").schema.inputSchema.safeParse({}).success).toBe(true);
  });

  it("navigate requires non-empty url", () => {
    expect(tool("navigate").schema.inputSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      tool("navigate").schema.inputSchema.safeParse({ url: "" }).success,
    ).toBe(false);
    expect(
      tool("navigate").schema.inputSchema.safeParse({
        url: "https://example.com",
      }).success,
    ).toBe(true);
  });

  it("act requires non-empty action", () => {
    expect(tool("act").schema.inputSchema.safeParse({}).success).toBe(false);
    expect(
      tool("act").schema.inputSchema.safeParse({ action: "" }).success,
    ).toBe(false);
    expect(
      tool("act").schema.inputSchema.safeParse({ action: "click button" })
        .success,
    ).toBe(true);
  });

  it("observe requires non-empty instruction", () => {
    expect(tool("observe").schema.inputSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      tool("observe").schema.inputSchema.safeParse({ instruction: "" }).success,
    ).toBe(false);
    expect(
      tool("observe").schema.inputSchema.safeParse({
        instruction: "find links",
      }).success,
    ).toBe(true);
  });

  it("extract accepts optional instruction", () => {
    expect(tool("extract").schema.inputSchema.safeParse({}).success).toBe(true);
    expect(
      tool("extract").schema.inputSchema.safeParse({ instruction: "get title" })
        .success,
    ).toBe(true);
  });
});

describe("tool capabilities", () => {
  it("all tools have core capability", () => {
    for (const t of TOOLS) {
      expect(t.capability).toBe("core");
    }
  });

  it("all tools have a handle function", () => {
    for (const t of TOOLS) {
      expect(typeof t.handle).toBe("function");
    }
  });
});
