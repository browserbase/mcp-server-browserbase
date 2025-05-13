import os from 'os';
import fs from 'fs';
import path from 'path';
import { sanitizeForFilePath } from './tools/utils.js'; 
import type { Cookie } from "playwright-core";

export type ToolCapability = 'core' | string; 

export interface Config {
  browserbaseApiKey?: string; 
  browserbaseProjectId?: string; 
  server?: {
    port?: number;
    host?: string;
  };
  proxies?: boolean;
  advancedStealth?: boolean;
  context?: {
    contextId?: string;
    persist?: boolean;
  };
  viewPort?: {
    browserWidth?: number;
    browserHeight?: number;
  };
  cookies?: Cookie[]; 
}

// Define Command Line Options Structure
export type CLIOptions = {
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  proxies?: boolean;
  advancedStealth?: boolean;
  contextId?: string;
  persist?: boolean;
  port?: number;
  host?: string;
  cookies?: Cookie[];
  browserWidth?: number;
  browserHeight?: number;
};

// Default Configuration Values
const defaultConfig: Config = {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID,
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
};

// Resolve final configuration by merging defaults, file config, and CLI options
export async function resolveConfig(cliOptions: CLIOptions): Promise<Config> {
  const cliConfig = await configFromCLIOptions(cliOptions);
  // Order: Defaults < File Config < CLI Overrides
  const mergedConfig = mergeConfig(defaultConfig, cliConfig);

  // --- Add Browserbase Env Vars ---
  // Ensure env vars are read *after* dotenv potentially runs (in index.ts)
  if (!mergedConfig.browserbaseApiKey) {
    mergedConfig.browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
  }
  if (!mergedConfig.browserbaseProjectId) {
    mergedConfig.browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
  }
  // --------------------------------

  // Basic validation for Browserbase keys
  if (!mergedConfig.browserbaseApiKey) {
    console.warn("Warning: BROWSERBASE_API_KEY environment variable not set.");
  }
  if (!mergedConfig.browserbaseProjectId) {
      console.warn("Warning: BROWSERBASE_PROJECT_ID environment variable not set.");
  }

  return mergedConfig;
}

// Create Config structure based on CLI options
export async function configFromCLIOptions(cliOptions: CLIOptions): Promise<Config> {
 return {
    browserbaseApiKey: cliOptions.browserbaseApiKey,
    browserbaseProjectId: cliOptions.browserbaseProjectId,
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
  };
}

// Create an output file path within the configured output directory
export async function outputFile(config: Config, name: string): Promise<string> {
  const outputDir = os.tmpdir();
  await fs.promises.mkdir(outputDir, { recursive: true });
  const sanitizedName = sanitizeForFilePath(name);
  return path.join(outputDir, sanitizedName);
}

// Helper function to merge config objects, excluding undefined values
function pickDefined<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v !== undefined)
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
    if (key === 'context' && value && result.context) {
      // Special handling for context object to ensure deep merge
      result.context = {
        ...result.context,
        ...(value as Config['context'])
      };
    } else if (
      value && 
      typeof value === 'object' && 
      !Array.isArray(value) && 
      result[key as keyof Config] && 
      typeof result[key as keyof Config] === 'object'
    ) {
      // Deep merge for other nested objects
      result[key as keyof Config] = {
        ...(result[key as keyof Config] as object),
        ...value
      } as any;
    } else {
      // Simple override for primitives, arrays, etc.
      result[key as keyof Config] = value as any;
    }
  }
  
  return result;
} 