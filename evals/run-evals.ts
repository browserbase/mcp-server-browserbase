#!/usr/bin/env tsx

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import { evaluate } from "mcpvals";
import os from "os";
import chalk from "chalk";

// Load environment variables from .env file
import { config } from "dotenv";
config();

// Types for evaluation results
interface EvaluationResult {
  workflowName: string;
  passed: boolean;
  overallScore: number;
  results: Array<{
    metric: string;
    passed: boolean;
    score: number;
    details: string;
    metadata?: Record<string, unknown>;
  }>;
}

interface EvaluationReport {
  config: Record<string, unknown>;
  evaluations: EvaluationResult[];
  passed: boolean;
  timestamp: Date;
}

interface TestResult {
  config: string;
  passed: boolean;
  score: number;
  duration: number;
  workflows: {
    name: string;
    passed: boolean;
    score: number;
  }[];
}

interface EvalConfig {
  workflows: Array<{ name?: string }>;
  passThreshold?: number;
  [key: string]: unknown;
}

const program = new Command();

program
  .name("browserbase-mcp-evals")
  .description("Run evaluation tests for Browserbase MCP Server")
  .version("1.0.0");

program
  .command("run")
  .description("Run evaluation tests")
  .option(
    "-c, --config <path>",
    "Config file path",
    "./evals/mcp-eval.config.json",
  )
  .option("-d, --debug", "Enable debug output")
  .option("-j, --json", "Output results as JSON")
  .option("-l, --llm", "Enable LLM judge")
  .option("-o, --output <path>", "Save results to file")
  .option(
    "-p, --pass-threshold <number>",
    "Minimum average score (0-1) required to pass. Can also be set via EVAL_PASS_THRESHOLD env var.",
  )
  .option("-t, --timeout <ms>", "Override timeout in milliseconds")
  .action(async (options) => {
    try {
      const startTime = Date.now();

      // Check for required environment variables
      const requiredEnvVars = [
        "BROWSERBASE_API_KEY",
        "BROWSERBASE_PROJECT_ID",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
      ];
      const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

      if (missingVars.length > 0) {
        console.error(
          chalk.red(
            `Missing required environment variables: ${missingVars.join(", ")}`,
          ),
        );
        console.error(
          chalk.yellow("Please set them before running the tests."),
        );
        console.error(chalk.yellow("Example:"));

        for (const missingVar of missingVars) {
          switch (missingVar) {
            case "BROWSERBASE_API_KEY":
              console.error(
                chalk.yellow(
                  "  export BROWSERBASE_API_KEY='your_api_key_here'",
                ),
              );
              break;
            case "BROWSERBASE_PROJECT_ID":
              console.error(
                chalk.yellow(
                  "  export BROWSERBASE_PROJECT_ID='your_project_id_here'",
                ),
              );
              break;
            case "ANTHROPIC_API_KEY":
              console.error(
                chalk.yellow(
                  "  export ANTHROPIC_API_KEY='sk-ant-your_key_here'",
                ),
              );
              break;
            case "GEMINI_API_KEY":
              console.error(
                chalk.yellow("  export GEMINI_API_KEY='your_gemini_key_here'"),
              );
              break;
          }
        }
        process.exit(1);
      }

      // Check for LLM judge requirements
      if (options.llm && !process.env.OPENAI_API_KEY) {
        console.error(
          chalk.red("LLM judge requires OPENAI_API_KEY environment variable"),
        );
        process.exit(1);
      }

      // Resolve config path
      const configPath = path.resolve(options.config);

      // Load config to get workflow count for display
      const configContent = await fs.readFile(configPath, "utf-8");
      const config: EvalConfig = JSON.parse(configContent);

      console.log(chalk.blue(`Running evaluation tests from: ${configPath}`));
      console.log(chalk.gray(`Workflows to test: ${config.workflows.length}`));

      // Prepare evaluation options
      const evalOptions = {
        debug: options.debug,
        reporter: (options.json ? "json" : "console") as
          | "json"
          | "console"
          | "junit"
          | undefined,
        llmJudge: options.llm,
        timeout: options.timeout ? parseInt(options.timeout) : undefined,
      };

      console.log(
        chalk.yellow(
          "Parallel mode: splitting workflows and running concurrently",
        ),
      );

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-evals-"));

      const workflowFiles: string[] = [];
      for (let i = 0; i < config.workflows.length; i++) {
        const wf = config.workflows[i];
        const wfConfig = { ...config, workflows: [wf] };
        const wfPath = path.join(
          tmpDir,
          `workflow-${i}-${(wf.name || "unnamed").replace(/[^a-z0-9_-]/gi, "_")}.json`,
        );
        await fs.writeFile(wfPath, JSON.stringify(wfConfig, null, 2));
        workflowFiles.push(wfPath);
      }

      const reports: EvaluationReport[] = await Promise.all(
        workflowFiles.map((wfPath) => evaluate(wfPath, evalOptions)),
      );

      // Aggregate results
      const allEvaluations = reports.flatMap((r) => r.evaluations);
      const duration = Date.now() - startTime;

      // Determine pass/fail based on threshold instead of strict all-pass
      const avgScore =
        allEvaluations.length === 0
          ? 0
          : allEvaluations.reduce((sum, e) => sum + e.overallScore, 0) /
            allEvaluations.length;

      const thresholdFromEnv =
        (process.env.EVAL_PASS_THRESHOLD || process.env.PASS_THRESHOLD) ?? "";
      const thresholdFromCli = options.passThreshold ?? "";
      const thresholdFromConfig =
        typeof config.passThreshold === "number"
          ? String(config.passThreshold)
          : "";
      const threshold = (() => {
        const raw = String(
          thresholdFromCli || thresholdFromEnv || thresholdFromConfig,
        ).trim();
        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed)) return 0.6; // default lowered threshold
        return parsed;
      })();

      const passed = avgScore >= threshold;

      const finalReport: EvaluationReport = {
        config: { parallel: true, source: configPath },
        evaluations: allEvaluations,
        passed,
        timestamp: new Date(),
      };

      const finalResult: TestResult = {
        config: configPath,
        passed,
        score: avgScore,
        duration,
        workflows: allEvaluations.map((e) => ({
          name: e.workflowName,
          passed: e.passed,
          score: e.overallScore,
        })),
      };

      // Best-effort cleanup
      try {
        await Promise.all(workflowFiles.map((f) => fs.unlink(f)));
        await fs.rmdir(tmpDir);
      } catch {
        // ignore cleanup errors
      }

      // Output results
      if (options.json) {
        console.log(JSON.stringify(finalResult, null, 2));
      } else {
        console.log(
          chalk.green(
            `\nTest execution completed in ${(finalResult.duration / 1000).toFixed(2)}s`,
          ),
        );
        console.log(
          chalk.gray(
            `Threshold for pass: ${threshold.toFixed(2)} | Average score: ${finalResult.score.toFixed(3)}`,
          ),
        );
        console.log(
          chalk[finalResult.passed ? "green" : "red"](
            `Overall result: ${finalResult.passed ? "PASSED" : "FAILED"} (${(finalResult.score * 100).toFixed(1)}%)`,
          ),
        );
      }

      // Save to file if requested
      if (options.output) {
        await fs.writeFile(
          options.output,
          JSON.stringify(finalReport, null, 2),
        );
        console.log(chalk.gray(`Results saved to: ${options.output}`));
      }

      process.exit(finalResult.passed ? 0 : 1);
    } catch (error) {
      console.error("Error running evaluation tests:", error);
      process.exit(1);
    }
  });

program.parse();
