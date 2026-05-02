---
"@browserbasehq/mcp": major
---

Rename `advancedStealth` to `verified` to match the renamed Browserbase API field.

**Breaking changes:**

- CLI flag `--advancedStealth` renamed to `--verified`
- Config field `advancedStealth` renamed to `verified` (in `config.d.ts` / Smithery `configSchema`)

Migration: replace `--advancedStealth` with `--verified` in your CLI invocations, and rename the `advancedStealth` field to `verified` in any config files or `configSchema` overrides.

Also bumps the minimum `@browserbasehq/stagehand` peer to `^3.3.0`, the version that introduced support for the `verified` browser setting.
