<!-- d93ad3e4-1668-4333-8e39-d878faf06005 132f9ffa-0c5f-4fdc-a079-cc5c673f4d77 -->

# Plan: Integrate Gemini usage metadata into Stagehand MCP usage stats

## Overview

We will update the existing Stagehand usage tracking in the Browserbase MCP server so that, when Gemini is the backing model, it records **exact token usage** from Gemini's `usage_metadata` instead of local estimates. These richer metrics will be surfaced via the existing `browserbase_usage_stats` tool in a shape similar to Claude Agent SDK's `message.usage` (tokens + cost).

## Key facts from Gemini API

- Gemini responses expose **usage metadata** on each call, e.g. `usage_metadata` / `usageMetadata` with:
- `prompt_token_count` / `promptTokenCount`
- `candidates_token_count` / `candidatesTokenCount`
- `total_token_count` / `totalTokenCount`
- We should rely on this **post-request usage metadata** for accurate accounting rather than local token counting.
- Cost is not returned directly by Gemini but can be derived from published pricing using the token counts; we will compute `total_cost_usd` from those counts and a configured price table for the Gemini model in use.

## Design decisions

- **Scope**: Only track detailed token metrics when the underlying LLM is **Gemini via the official API**; for other models we keep the current call-count-only behavior.
- **Metrics shape**: For each operation we will aggregate fields that mirror Claude Agent SDK usage:
- `input_tokens` (mapped from Gemini `prompt_token_count`)
- `output_tokens` (mapped from Gemini `candidates_token_count`)
- `cache_read_input_tokens` (0 for now, unless Gemini exposes cache reads explicitly)
- `cache_creation_input_tokens` (0 for now, unless Gemini exposes cache creation explicitly)
- `total_cost_usd` (derived from `input_tokens`/`output_tokens` and a simple pricing table keyed by model name).
- **Where to plug in**: Prefer to capture usage **at the point where the Gemini client is called**. If Stagehand exposes `usage_metadata` on its result, use that; otherwise, configure Stagehand's model to use a **wrapped Gemini client** that returns both the normal result and usage metadata for accounting.
- **Configuration**: Add an internal mapping of Gemini model names to per-token prices, so cost computation is centralized and easy to update.

## Implementation steps

### 1. Extend the usage tracker types and API

1. Update `src/mcp/usage.ts`:

- Introduce a `StagehandUsageMetrics` type with:
- `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `totalCostUsd` (all numbers, defaulting to 0 when absent).
- Extend `StagehandOperationStats` to include aggregated fields:
- `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `totalCostUsd`.
- Change `recordStagehandCall` to accept an optional `metrics?: StagehandUsageMetrics` argument and, when present, add those values to both the **global** and **per-session** aggregates.
- Keep the existing call-count and `toolCallCounts` logic intact.

### 2. Add a Gemini pricing helper for cost computation

1. Create a small helper (new module or inside `usage.ts`) that:

- Defines a mapping from Gemini model names used in this project (e.g. `"gemini-2.0-flash"`, `"google/gemini-2.5-computer-use-preview-10-2025"`) to per-token prices for input and output tokens.
- Exposes a function `computeGeminiCostUsd({ modelName, inputTokens, outputTokens }): number` that multiplies token counts by the configured prices and returns `total_cost_usd`.

2. This helper should be easy to update if pricing changes, but it should not make any external API calls at runtime.

### 3. Determine how to access Gemini usage metadata through Stagehand

1. Review Stagehand documentation / types (and, if available in the codebase, its usage patterns) to confirm whether it exposes Gemini `usage_metadata` on:

- The return value of the operations we already call (`agent.execute`, `extract`, `observe`, etc.), or
- Some internal hook/callback or logging mechanism.

2. If Stagehand surfaces `usage_metadata` directly on results (e.g. `result.usage_metadata` or similar):

- For each Stagehand-using tool, extract `prompt_token_count` and `candidates_token_count` from the result.

3. If Stagehand does **not** surface usage metadata, adapt the Stagehand configuration in `sessionManager.ts` or `createStagehandInstance` so that it uses a **wrapped Gemini client** that:

- Calls the real Gemini client.
- Reads `response.usage_metadata`.
- Returns the normal content to Stagehand but also provides usage metadata in a way our tools can read (e.g. attached to the result, or via a shared metrics callback that calls `recordStagehandCall`).

### 4. Feed Gemini metrics into recordStagehandCall

1. For each Stagehand-backed tool (`agent.ts`, `extract.ts`, `observe.ts`, `act.ts`, `navigate.ts`, `screenshot.ts`, `url.ts`):

- After the Gemini-driven Stagehand call completes and the result is available, derive a `StagehandUsageMetrics` object when **and only when** Gemini usage metadata is available.
- Map fields as:
- `inputTokens = usage_metadata.prompt_token_count`
- `outputTokens = usage_metadata.candidates_token_count`
- `cacheReadInputTokens = 0` (until caching semantics are exposed)
- `cacheCreationInputTokens = 0`
- `totalCostUsd = computeGeminiCostUsd({ modelName, inputTokens, outputTokens })`
- Call `recordStagehandCall({ sessionId, toolName, operation }, metrics)` instead of the current call-count-only signature.

2. If usage metadata is not available for a particular call (e.g., non-Gemini model or legacy code path), call `recordStagehandCall` without the `metrics` argument so the system still tracks call counts.

### 5. Adjust the usage stats tool output format

1. Update `src/tools/usage.ts` to:

- Return the new numeric fields (input/output tokens, cache\_\* tokens, total_cost_usd) as part of each operation’s JSON object.
- Optionally adjust the JSON keys to snake_case (`input_tokens`, `output_tokens`, etc.) to mirror Claude Agent SDK’s `message.usage` naming.

2. Keep the existing `scope` (`global`/`perSession`/`all`), `sessionId`, and `reset` behavior unchanged so existing integrations continue to work.

### 6. Documentation updates

1. Update the README section for **Stagehand usage metrics** to:

- Mention that, when using Gemini as the model, `browserbase_usage_stats` returns:
- `input_tokens`, `output_tokens`, `total_cost_usd`, and placeholder `cache_*` fields (currently zero unless Gemini exposes explicit cache usage).
- Clarify that these token counts come directly from Gemini’s `usage_metadata` and that cost is derived from them using a simple internal price table.

2. Optionally add a short example snippet showing how a Claude Agent SDK-based agent can:

- Call `browserbase_usage_stats` at the end of a run.
- Read `total_cost_usd` and token counts for reporting alongside Claude’s own `message.usage`.

## Notes and future extensions

- If Stagehand later adds first-class support for exposing underlying model usage/cost, we can simplify our wrapping logic and rely on that instead.
- If Gemini introduces direct cost reporting in responses, we can remove local pricing tables and use the API’s `total_cost_usd` directly, simplifying `computeGeminiCostUsd`.

### To-dos

- [ ] Create shared in-memory usage tracker in src/mcp/usage.ts with record/get/reset functions and appropriate types.
- [ ] Import and call the usage tracker from all Stagehand-using tools (agent, act, navigate, observe, extract, screenshot, url) to record each Stagehand operation with session and tool info.
- [ ] Add a new MCP tool browserbase_usage_stats that returns a snapshot of usage metrics via MCP call_tool, and register it in the tools index.
- [ ] Update README and any relevant Agent SDK integration examples to show how to call the usage stats tool and interpret its output.
