import type { Page } from "@browserbasehq/stagehand";

export type ConsoleTelemetryEntry = {
  timestamp: string;
  sessionId: string;
  browserbaseSessionId: string;
  source: "console" | "pageerror";
  type: string;
  text: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
};

type ConsoleMessageLike = {
  type: () => string;
  text: () => string;
  location: () => {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
};

type PageWithTelemetryEvents = Page & {
  on(event: "console", listener: (message: ConsoleMessageLike) => void): Page;
  on(event: "pageerror", listener: (error: Error) => void): Page;
  off?(
    event: "console",
    listener: (message: ConsoleMessageLike) => void,
  ): Page;
  off?(event: "pageerror", listener: (error: Error) => void): Page;
  removeListener?(
    event: "console",
    listener: (message: ConsoleMessageLike) => void,
  ): Page;
  removeListener?(event: "pageerror", listener: (error: Error) => void): Page;
};

type PageEventRemover = {
  (event: "console", listener: (message: ConsoleMessageLike) => void): Page;
  (event: "pageerror", listener: (error: Error) => void): Page;
};

export class ConsoleTelemetry {
  private entries: ConsoleTelemetryEntry[] = [];
  private readonly page: PageWithTelemetryEvents;
  private readonly maxEntries: number;
  private readonly sessionId: string;
  private readonly browserbaseSessionId: string;
  private attached = false;

  private readonly consoleListener = (message: ConsoleMessageLike) => {
    const location = message.location();
    this.push({
      source: "console",
      type: message.type(),
      text: message.text(),
      url: location.url,
      lineNumber: location.lineNumber,
      columnNumber: location.columnNumber,
    });
  };

  private readonly pageErrorListener = (error: Error) => {
    this.push({
      source: "pageerror",
      type: "error",
      text: error.message,
    });
  };

  constructor({
    page,
    sessionId,
    browserbaseSessionId,
    maxEntries = 200,
  }: {
    page: Page;
    sessionId: string;
    browserbaseSessionId: string;
    maxEntries?: number;
  }) {
    this.page = page as PageWithTelemetryEvents;
    this.sessionId = sessionId;
    this.browserbaseSessionId = browserbaseSessionId;
    this.maxEntries = maxEntries;
  }

  attach(): void {
    if (this.attached) return;
    this.page.on("console", this.consoleListener);
    this.page.on("pageerror", this.pageErrorListener);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    const page = this.page as PageWithTelemetryEvents & {
      off?: PageEventRemover;
      removeListener?: PageEventRemover;
    };

    if (page.off) {
      page.off("console", this.consoleListener);
      page.off("pageerror", this.pageErrorListener);
    } else if (page.removeListener) {
      page.removeListener("console", this.consoleListener);
      page.removeListener("pageerror", this.pageErrorListener);
    }
    this.attached = false;
  }

  list({
    limit = 50,
    types,
  }: {
    limit?: number;
    types?: string[];
  } = {}): ConsoleTelemetryEntry[] {
    const normalizedTypes = types?.map((type) => type.toLowerCase());
    const filtered = normalizedTypes?.length
      ? this.entries.filter((entry) =>
          normalizedTypes.includes(entry.type.toLowerCase()),
        )
      : this.entries;

    return filtered.slice(-limit);
  }

  clear(): void {
    this.entries = [];
  }

  private push(
    entry: Omit<
      ConsoleTelemetryEntry,
      "timestamp" | "sessionId" | "browserbaseSessionId"
    >,
  ): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      browserbaseSessionId: this.browserbaseSessionId,
      ...entry,
    });

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }
}
