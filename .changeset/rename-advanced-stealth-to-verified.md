---
"@browserbasehq/mcp": minor
---

Add `verified` as the canonical Browserbase Verified Identity setting while preserving `advancedStealth` as a deprecated alias.

**Changes:**

- CLI flag `--verified` added; `--advancedStealth` remains supported as a deprecated alias
- Config field `verified` added; `advancedStealth` remains supported as a deprecated alias in `config.d.ts` and Smithery `configSchema`

Migration: prefer `--verified` in CLI invocations and `verified` in config files or `configSchema` overrides.

Also bumps the minimum `@browserbasehq/stagehand` peer to `^3.3.0`, the version that introduced support for the Verified Identity setting.
