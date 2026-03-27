---
"@browserbasehq/mcp-server-browserbase": major
---

Align tool names and schemas with the hosted Browserbase MCP server at mcp.browserbase.com.

**Breaking changes:**

- Tool `browserbase_session_create` renamed to `start`
- Tool `browserbase_session_close` renamed to `end`
- Tool `browserbase_stagehand_navigate` renamed to `navigate`
- Tool `browserbase_stagehand_act` renamed to `act`
- Tool `browserbase_stagehand_observe` renamed to `observe`
- Tool `browserbase_stagehand_extract` renamed to `extract`
- Tools `browserbase_screenshot`, `browserbase_stagehand_get_url`, and `browserbase_stagehand_agent` removed
- `act` tool no longer accepts `variables` parameter
- `start` tool no longer accepts `sessionId` parameter
- `extract` tool `instruction` is now optional (matches hosted)
- Default model changed from `gemini-2.0-flash` to `google/gemini-2.5-flash-lite`
- Removed Smithery references and dependencies
