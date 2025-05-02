import type { Config } from '../config.js';

export type CLIOptions = {
  server?: {
    port?: number;
    host?: string;
  };
  proxies?: boolean;
};

const defaultConfig: Config = {
  proxies: false,
};

export async function resolveConfig(cliOptions: CLIOptions): Promise<Config> {
  const config = await configFromCLIOptions(cliOptions);
  return mergeConfig(defaultConfig, config);
}

export async function configFromCLIOptions(cliOptions: CLIOptions): Promise<Config> {
  return {
    server: {
      port: cliOptions.server?.port,
      host: cliOptions.server?.host,
    },
    proxies: cliOptions.proxies,
  };
}

function pickDefined<T extends object>(obj: T | undefined): Partial<T> {
  return Object.fromEntries(
      Object.entries(obj ?? {}).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

function mergeConfig(base: Config, overrides: Config): Config {
  return {
    ...pickDefined(base),
    ...pickDefined(overrides),
  };
}