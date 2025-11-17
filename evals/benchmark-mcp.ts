#!/usr/bin/env tsx

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { query } from "@anthropic-ai/claude-agent-sdk";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SupportedDatasetName = "onlineMind2Web";

interface OnlineMind2WebTask {
  task_id: string;
  confirmed_task: string;
  website: string;
  reference_length: number;
  level: string;
}

interface ClaudeUsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_cost_usd: number;
}

interface TaskRunResult {
  taskId: string;
  website: string;
  level: string;
  durationMs: number;
  usage: ClaudeUsageTotals;
}

interface StagehandUsageTotals {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTimeMs: number;
}

const DATASETS: Record<SupportedDatasetName, string> = {
  onlineMind2Web: path.resolve(
    __dirname,
    "./datasets/onlineMind2Web/onlineMind2Web.jsonl",
  ),
};

const MCP_PRESETS: Record<
  string,
  {
    type: "stdio";
    command: string;
    args: string[];
    env?: Record<string, string>;
  }
> = {
  stagehand: {
    type: "stdio",
    command: "npx",
    args: ["@browserbasehq/mcp-server-browserbase@latest"],
    env: {},
  },
  playwright: {
    type: "stdio",
    command: "npx",
    args: ["@playwright/mcp@latest"],
    env: {},
  },
  "chrome-devtools": {
    type: "stdio",
    command: "npx",
    args: ["chrome-devtools-mcp@latest"],
    env: {},
  },
  "browser-use": {
    type: "stdio",
    command: "npx",
    args: ["browser-use-mcp@latest"],
    env: {},
  },
};

async function loadTasks(
  datasetName: SupportedDatasetName,
): Promise<OnlineMind2WebTask[]> {
  const datasetPath = DATASETS[datasetName];
  if (!datasetPath) {
    throw new Error(
      `[benchmark-mcp] Unsupported dataset "${datasetName}". Supported datasets: ${Object.keys(DATASETS).join(", ")}`,
    );
  }
  const raw = await fs.readFile(datasetPath, "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  const tasks: OnlineMind2WebTask[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as OnlineMind2WebTask;
      if (parsed && parsed.task_id && parsed.confirmed_task && parsed.website) {
        tasks.push(parsed);
      }
    } catch (err) {
      // Skip malformed lines but surface a hint once.
      console.error("Skipping malformed JSONL line from dataset:", err);
    }
  }

  return tasks;
}

type QueryOptions = Parameters<typeof query>[0];

type QueryStreamMessage = {
  usage?:
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        total_cost_usd?: number;
      }
    | undefined;
};

async function runTaskWithAgent(
  task: OnlineMind2WebTask,
  mcpName: string,
  mcpConfig: (typeof MCP_PRESETS)[string],
): Promise<TaskRunResult> {
  const prompt = [
    "You are a browsing agent.",
    "",
    `Start URL: ${task.website}`,
    `Task: ${task.confirmed_task}`,
    "",
    "Use the available MCP tools to browse and complete this task.",
    "When you are done, briefly summarize what you did.",
  ].join("\n");

  const usageTotals: ClaudeUsageTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    total_cost_usd: 0,
  };

  const startTime = Date.now();

  const stream = query({
    prompt,
    options: {
      mcpServers: {
        [mcpName]: mcpConfig as unknown as Record<string, unknown>,
      },
    },
  } as QueryOptions);

  for await (const message of stream as AsyncIterable<QueryStreamMessage>) {
    const usage = message.usage;

    if (usage) {
      usageTotals.input_tokens += usage.input_tokens ?? 0;
      usageTotals.output_tokens += usage.output_tokens ?? 0;
      usageTotals.cache_creation_input_tokens +=
        usage.cache_creation_input_tokens ?? 0;
      usageTotals.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
      usageTotals.total_cost_usd += usage.total_cost_usd ?? 0;
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    taskId: task.task_id,
    website: task.website,
    level: task.level,
    durationMs,
    usage: usageTotals,
  };
}

async function fetchStagehandTokenUsageSummary(): Promise<StagehandUsageTotals | null> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  const modelApiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  const browserbaseSessionId = process.env.BROWSERBASE_SESSION_ID;

  if (!apiKey || !projectId || !modelApiKey || !browserbaseSessionId) {
    console.error(
      "[benchmark-mcp] Skipping Stagehand replay call due to missing API keys or BROWSERBASE_SESSION_ID.",
    );
    return null;
  }

  const replayResponse = await fetch(
    `https://api.stagehand.browserbase.com/v1/sessions/${browserbaseSessionId}/replay`,
    {
      method: "GET",
      headers: {
        "x-bb-api-key": apiKey,
        "x-bb-project-id": projectId,
        "x-bb-session-id": browserbaseSessionId,
        "x-stream-response": "true",
        "x-model-api-key": modelApiKey,
        "x-sent-at": new Date().toISOString(),
        "x-language": "typescript",
        "x-sdk-version": "3.0.1",
      },
    },
  );

  try {
    const replayJson = (await replayResponse.json()) as {
      data: {
        pages: Array<{
          actions: Array<{
            tokenUsage?: {
              inputTokens: number;
              outputTokens: number;
              timeMs?: number;
            };
          }>;
        }>;
      };
    };

    const totals: StagehandUsageTotals = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTimeMs: 0,
    };

    for (const page of replayJson.data.pages) {
      for (const action of page.actions) {
        if (action.tokenUsage) {
          totals.totalInputTokens += action.tokenUsage.inputTokens;
          totals.totalOutputTokens += action.tokenUsage.outputTokens;
          if (typeof action.tokenUsage.timeMs === "number") {
            totals.totalTimeMs += action.tokenUsage.timeMs;
          }
        }
      }
    }

    return totals;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      "[benchmark-mcp] Failed to parse Stagehand replay response:",
      message,
    );
    return null;
  }
}

async function runBenchmark(
  mcpName: string,
  datasetName: SupportedDatasetName,
  limit?: number,
): Promise<void> {
  const mcpConfig = MCP_PRESETS[mcpName];
  if (!mcpConfig) {
    console.error(
      `[benchmark-mcp] Unsupported MCP "${mcpName}". Supported MCPs: ${Object.keys(MCP_PRESETS).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  let tasks = await loadTasks(datasetName);
  if (tasks.length === 0) {
    console.error(
      `[benchmark-mcp] No tasks loaded for dataset "${datasetName}".`,
    );
    process.exitCode = 1;
    return;
  }

  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    tasks = tasks.slice(0, Math.min(limit, tasks.length));
  }

  console.log(
    `[benchmark-mcp] Running benchmark for MCP "${mcpName}" on dataset "${datasetName}" with ${tasks.length} tasks.`,
  );

  const overallStart = Date.now();

  const aggregateUsage: ClaudeUsageTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    total_cost_usd: 0,
  };

  let totalDurationMs = 0;

  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index];
    const taskNumber = index + 1;

    console.log(
      `[benchmark-mcp] Task ${taskNumber}/${tasks.length} (${task.level}) ${task.task_id}`,
    );
    console.log(`[benchmark-mcp]   Website: ${task.website}`);
    console.log(`[benchmark-mcp]   Goal: ${task.confirmed_task}`);

    const result = await runTaskWithAgent(task, mcpName, mcpConfig);

    console.log(
      `[benchmark-mcp]   Completed in ${(result.durationMs / 1000).toFixed(2)}s | Claude tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`,
    );

    totalDurationMs += result.durationMs;
    aggregateUsage.input_tokens += result.usage.input_tokens;
    aggregateUsage.output_tokens += result.usage.output_tokens;
    aggregateUsage.cache_creation_input_tokens +=
      result.usage.cache_creation_input_tokens;
    aggregateUsage.cache_read_input_tokens +=
      result.usage.cache_read_input_tokens;
    aggregateUsage.total_cost_usd += result.usage.total_cost_usd;
  }

  const overallDurationMs = Date.now() - overallStart;
  const avgTaskDurationMs = totalDurationMs / tasks.length;

  console.log("");
  console.log(
    `[benchmark-mcp] MCP: ${mcpName} | Dataset: ${datasetName} | Tasks: ${tasks.length}`,
  );
  console.log(
    `[benchmark-mcp] Total time: ${(overallDurationMs / 1000).toFixed(2)}s | Avg/task: ${(avgTaskDurationMs / 1000).toFixed(2)}s`,
  );
  console.log(
    `[benchmark-mcp] Claude tokens: ${aggregateUsage.input_tokens} in / ${aggregateUsage.output_tokens} out`,
  );
  console.log(
    `[benchmark-mcp] Claude cache tokens: ${aggregateUsage.cache_creation_input_tokens} created / ${aggregateUsage.cache_read_input_tokens} read`,
  );
  console.log(
    `[benchmark-mcp] Claude cost (approx): $${aggregateUsage.total_cost_usd.toFixed(6)}`,
  );

  if (mcpName === "stagehand") {
    const stagehandTotals = await fetchStagehandTokenUsageSummary();
    if (stagehandTotals) {
      console.log(
        `[benchmark-mcp] Stagehand tokens: ${stagehandTotals.totalInputTokens} in / ${stagehandTotals.totalOutputTokens} out | Time: ${(stagehandTotals.totalTimeMs / 1000).toFixed(2)}s`,
      );
    }
  }
}

const program = new Command();

program
  .name("benchmark-mcp")
  .description(
    "Lightweight benchmarking script for MCPs using the Claude Agent SDK",
  );

program
  .requiredOption(
    "--mcp <name>",
    "MCP to benchmark (e.g. stagehand, playwright, chrome-devtools, browser-use)",
  )
  .option(
    "--dataset <name>",
    'Dataset name (currently only "onlineMind2Web" is supported)',
    "onlineMind2Web",
  )
  .option(
    "--limit <number>",
    "Limit the number of tasks to run (for quick smoke tests)",
  )
  .action(
    async (options: {
      mcp: string;
      dataset: SupportedDatasetName;
      limit?: string;
    }) => {
      const limit =
        typeof options.limit === "string"
          ? Number.parseInt(options.limit, 10)
          : undefined;
      await runBenchmark(options.mcp, options.dataset, limit);
    },
  );

program.parse();
