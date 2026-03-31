# @browserbasehq/mcp

## 3.0.0

### Major Changes

- 8f0b070: Align tool names and schemas with the hosted Browserbase MCP server at mcp.browserbase.com.

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

## 2.4.3

### Patch Changes

- chore: bump stagehand version (republish)

## 2.4.1

### Patch Changes

- update stagehand version to 3.0.3, change screenshot tool to use CDP and scaling image to work with claude code

## 2.4.0

### Minor Changes

- feat: adding stagehand agent tool

## 2.3.0

### Minor Changes

- upgrade to stagehand v3

## 2.2.0

### Minor Changes

- Remove multisession tools, remove prompts sampling, simplify tool descriptions for better context, add support if google apikey set, latest version of stagehand, remove custom availmodelschema to use stagehand model type instead.

## 2.1.3

### Patch Changes

- Adding docker deployment support

## 2.1.2

### Patch Changes

- fixing screenshot map behavior

## 2.1.1

### Patch Changes

- adding MCP server to official registry

## 2.1.0

### Minor Changes

- adding changesets, MCP UI for session create
