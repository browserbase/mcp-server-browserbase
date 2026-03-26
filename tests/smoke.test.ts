import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED_TOOLS = [
  "start",
  "end",
  "navigate",
  "act",
  "observe",
  "extract",
];

describe("MCP server smoke test", () => {
  it("lists exactly 6 tools with correct names via STDIO", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: ["./cli.js"],
      env: {
        ...process.env,
        BROWSERBASE_API_KEY: "test-key",
        BROWSERBASE_PROJECT_ID: "test-project",
      },
      stderr: "pipe",
    });

    const client = new Client({ name: "smoke-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();

      expect(tools).toHaveLength(6);

      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([...EXPECTED_TOOLS].sort());

      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
      }
    } finally {
      await client.close();
    }
  }, 15_000);
});
