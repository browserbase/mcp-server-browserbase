import type { Cookie } from "playwright-core";
import type { Config } from "../config.d.ts";
import type { AvailableModel } from "./types/models.js";

export type ToolCapability = "core" | string;

// Define Command Line Options Structure
export type CLIOptions = {
  proxies?: boolean;
  advancedStealth?: boolean;
  contextId?: string;
  persist?: boolean;
  port?: number;
  host?: string;
  cookies?: Cookie[];
  browserWidth?: number;
  browserHeight?: number;
  modelName?: typeof AvailableModel;
  modelApiKey?: string;
  keepAlive?: boolean;
  experimental?: boolean;
};

// Default Configuration Values
const defaultConfig: Config = {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY ?? "",
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID ?? "",
  proxies: false,
  server: {
    port: undefined,
    host: undefined,
  },
  viewPort: {
    browserWidth: 1024,
    browserHeight: 768,
  },
  cookies: undefined,
  modelName: "google/gemini-2.0-flash", // Default Model
};

// Resolve final configuration by merging defaults, file config, and CLI options
export async function resolveConfig(cliOptions: CLIOptions): Promise<Config> {
  const cliConfig = await configFromCLIOptions(cliOptions);
  // Order: Defaults < File Config < CLI Overrides
  const mergedConfig = mergeConfig(defaultConfig, cliConfig);

  // --- Add Browserbase Env Vars ---
  if (!mergedConfig.modelApiKey) {
    mergedConfig.modelApiKey = process.env.GEMINI_API_KEY;
  }

  // --------------------------------

  // Basic validation for Browserbase keys - provide dummy values if not set
  if (!mergedConfig.browserbaseApiKey) {
    console.warn(
      "Warning: BROWSERBASE_API_KEY environment variable not set. Using dummy value.",
    );
    mergedConfig.browserbaseApiKey = "dummy-browserbase-api-key";
  }
  if (!mergedConfig.browserbaseProjectId) {
    console.warn(
      "Warning: BROWSERBASE_PROJECT_ID environment variable not set. Using dummy value.",
    );
    mergedConfig.browserbaseProjectId = "dummy-browserbase-project-id";
  }

  if (!mergedConfig.modelApiKey) {
    console.warn(
      "Warning: MODEL_API_KEY environment variable not set. Using dummy value.",
    );
    mergedConfig.modelApiKey = "dummy-api-key";
  }

  return mergedConfig;
}

// Create Config structure based on CLI options
export async function configFromCLIOptions(
  cliOptions: CLIOptions,
): Promise<Config> {
  return {
    browserbaseApiKey: process.env.BROWSERBASE_API_KEY ?? "",
    browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID ?? "",
    server: {
      port: cliOptions.port,
      host: cliOptions.host,
    },
    proxies: cliOptions.proxies,
    context: {
      contextId: cliOptions.contextId,
      persist: cliOptions.persist,
    },
    viewPort: {
      browserWidth: cliOptions.browserWidth,
      browserHeight: cliOptions.browserHeight,
    },
    advancedStealth: cliOptions.advancedStealth,
    cookies: cliOptions.cookies,
    modelName: cliOptions.modelName,
    modelApiKey: cliOptions.modelApiKey,
    keepAlive: cliOptions.keepAlive,
    experimental: cliOptions.experimental,
  };
}

// Helper function to merge config objects, excluding undefined values
function pickDefined<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

// Merge two configuration objects (overrides takes precedence)
function mergeConfig(base: Config, overrides: Config): Config {
  const baseFiltered = pickDefined(base);
  const overridesFiltered = pickDefined(overrides);

  // Create the result object
  const result = { ...baseFiltered } as Config;

  // For each property in overrides
  for (const [key, value] of Object.entries(overridesFiltered)) {
    if (key === "context" && value && result.context) {
      // Special handling for context object to ensure deep merge
      result.context = {
        ...result.context,
        ...(value as Config["context"]),
      };
    } else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key as keyof Config] &&
      typeof result[key as keyof Config] === "object"
    ) {
      // Deep merge for other nested objects
      result[key as keyof Config] = {
        ...(result[key as keyof Config] as object),
        ...value,
      } as unknown;
    } else {
      // Simple override for primitives, arrays, etc.
      result[key as keyof Config] = value as unknown;
    }
  }

  return result;
}
