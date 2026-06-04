import { describe, expect, it } from "vitest";

import { ConsoleTelemetry } from "./consoleTelemetry.js";

type Listener = (...args: unknown[]) => void;

class FakePage {
  listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((item) => item !== listener),
    );
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

function consoleMessage({
  type = "error",
  text = "failed to load chunk",
  url = "https://example.com/app.js",
  lineNumber = 12,
  columnNumber = 4,
} = {}) {
  return {
    type: () => type,
    text: () => text,
    location: () => ({ url, lineNumber, columnNumber }),
  };
}

describe("ConsoleTelemetry", () => {
  it("captures console messages and page errors with session context", () => {
    const page = new FakePage();
    const telemetry = new ConsoleTelemetry({
      page: page as never,
      sessionId: "mcp-session",
      browserbaseSessionId: "bb-session",
    });

    telemetry.attach();
    page.emit("console", consoleMessage());
    page.emit("pageerror", new Error("hydration failed"));

    expect(telemetry.list()).toMatchObject([
      {
        sessionId: "mcp-session",
        browserbaseSessionId: "bb-session",
        source: "console",
        type: "error",
        text: "failed to load chunk",
        url: "https://example.com/app.js",
        lineNumber: 12,
        columnNumber: 4,
      },
      {
        sessionId: "mcp-session",
        browserbaseSessionId: "bb-session",
        source: "pageerror",
        type: "error",
        text: "hydration failed",
      },
    ]);
  });

  it("filters by type and bounds retained entries", () => {
    const page = new FakePage();
    const telemetry = new ConsoleTelemetry({
      page: page as never,
      sessionId: "mcp-session",
      browserbaseSessionId: "bb-session",
      maxEntries: 2,
    });

    telemetry.attach();
    page.emit("console", consoleMessage({ type: "info", text: "first" }));
    page.emit("console", consoleMessage({ type: "warning", text: "second" }));
    page.emit("console", consoleMessage({ type: "error", text: "third" }));

    expect(telemetry.list().map((entry) => entry.text)).toEqual([
      "second",
      "third",
    ]);
    expect(telemetry.list({ types: ["error"] })).toMatchObject([
      { type: "error", text: "third" },
    ]);
  });

  it("can clear and detach listeners", () => {
    const page = new FakePage();
    const telemetry = new ConsoleTelemetry({
      page: page as never,
      sessionId: "mcp-session",
      browserbaseSessionId: "bb-session",
    });
    telemetry.attach();
    telemetry.clear();
    telemetry.detach();
    page.emit("console", consoleMessage({ text: "after detach" }));

    expect(telemetry.list()).toEqual([]);
    expect(page.listeners.get("console")).toHaveLength(0);
    expect(page.listeners.get("pageerror")).toHaveLength(0);
  });
});
