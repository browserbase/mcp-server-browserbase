#!/usr/bin/env tsx

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import { evaluate } from "mcpvals";
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
  .option("-t, --timeout <ms>", "Override timeout in milliseconds")
  .action(async (options) => {
    try {
      const startTime = Date.now();

      // Check for required environment variables
      const requiredEnvVars = [
        "BROWSERBASE_API_KEY",
        "BROWSERBASE_PROJECT_ID",
        "ANTHROPIC_API_KEY",
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
      const config = JSON.parse(configContent);

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

      // Run evaluation - pass config file path, not parsed config object
      const report: EvaluationReport = await evaluate(configPath, evalOptions);

      const duration = Date.now() - startTime;

      // Process results
      const result: TestResult = {
        config: configPath,
        passed: report.passed,
        score:
          report.evaluations.reduce((sum, e) => sum + e.overallScore, 0) /
          report.evaluations.length,
        duration,
        workflows: report.evaluations.map((e) => ({
          name: e.workflowName,
          passed: e.passed,
          score: e.overallScore,
        })),
      };

      // Output results
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          chalk.green(
            `\nTest execution completed in ${(duration / 1000).toFixed(2)}s`,
          ),
        );
        console.log(
          chalk[result.passed ? "green" : "red"](
            `Overall result: ${result.passed ? "PASSED" : "FAILED"} (${(result.score * 100).toFixed(1)}%)`,
          ),
        );
      }

      // Save to file if requested
      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(report, null, 2));
        console.log(chalk.gray(`Results saved to: ${options.output}`));
      }

      process.exit(result.passed ? 0 : 1);
    } catch (error) {
      console.error("Error running evaluation tests:", error);
      process.exit(1);
    }
  });

program
  .command("compare")
  .description("Compare results from multiple test runs")
  .argument("<file1>", "First results file")
  .argument("<file2>", "Second results file")
  .option("-v, --verbose", "Show detailed comparison")
  .action(async (file1, file2, options) => {
    try {
      const results1: EvaluationReport = JSON.parse(
        await fs.readFile(file1, "utf-8"),
      );
      const results2: EvaluationReport = JSON.parse(
        await fs.readFile(file2, "utf-8"),
      );

      console.log(chalk.blue("Comparing test results:"));
      console.log(chalk.gray(`File 1: ${file1}`));
      console.log(chalk.gray(`File 2: ${file2}`));
      console.log();

      // Compare overall results
      const passed1 = results1.passed;
      const passed2 = results2.passed;

      if (passed1 === passed2) {
        console.log(chalk.yellow(`Both runs ${passed1 ? "PASSED" : "FAILED"}`));
      } else {
        console.log(chalk.green(`File 1: ${passed1 ? "PASSED" : "FAILED"}`));
        console.log(chalk.red(`File 2: ${passed2 ? "PASSED" : "FAILED"}`));
      }

      // Compare individual workflows if verbose
      if (options.verbose) {
        console.log(chalk.blue("\nWorkflow Comparison:"));

        const workflows1 = new Map(
          results1.evaluations.map((e) => [e.workflowName, e]),
        );
        const workflows2 = new Map(
          results2.evaluations.map((e) => [e.workflowName, e]),
        );

        const allWorkflows = new Set([
          ...workflows1.keys(),
          ...workflows2.keys(),
        ]);

        for (const workflow of allWorkflows) {
          const w1 = workflows1.get(workflow);
          const w2 = workflows2.get(workflow);

          if (!w1) {
            console.log(chalk.red(`- ${workflow}: Missing in file 1`));
          } else if (!w2) {
            console.log(chalk.red(`- ${workflow}: Missing in file 2`));
          } else {
            const scoreChange = (w2.overallScore - w1.overallScore) * 100;
            const color =
              scoreChange > 0 ? "green" : scoreChange < 0 ? "red" : "yellow";
            console.log(
              chalk[color](
                `- ${workflow}: ${(w1.overallScore * 100).toFixed(1)}% → ${(w2.overallScore * 100).toFixed(1)}% (${scoreChange > 0 ? "+" : ""}${scoreChange.toFixed(1)}%)`,
              ),
            );
          }
        }
      }
    } catch (error) {
      console.error("Error comparing results:", error);
      process.exit(1);
    }
  });

program.parse();
