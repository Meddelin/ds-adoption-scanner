import path from 'node:path';
import fs from 'node:fs';
import type { DSScannerConfig, ResolvedConfig } from './schema.js';
import { DEFAULT_CONFIG } from './defaults.js';

const CONFIG_FILE_NAMES = [
  '.ds-scanner.config.ts',
  '.ds-scanner.config.js',
  '.ds-scanner.config.mjs',
  '.ds-scanner.config.cjs',
];

export async function loadConfig(configPath?: string): Promise<{ config: ResolvedConfig; configPath: string }> {
  const resolvedPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : findConfigFile(process.cwd());

  if (!resolvedPath) {
    throw new ConfigError(
      `Config file not found. Create .ds-scanner.config.ts or pass --config path.\n` +
      `Run 'ds-scanner init' to generate a starter config.`
    );
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new ConfigError(`Config file not found: ${resolvedPath}`);
  }

  let rawConfig: DSScannerConfig;
  try {
    rawConfig = await importConfig(resolvedPath);
  } catch (err) {
    throw new ConfigError(
      `Failed to load config from ${resolvedPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const config = mergeWithDefaults(rawConfig);
  validateConfig(config, resolvedPath);

  return { config, configPath: resolvedPath };
}

function findConfigFile(dir: string): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function importConfig(filePath: string): Promise<DSScannerConfig> {
  // Try dynamic import first (works for .js/.mjs)
  const ext = path.extname(filePath);

  if (ext === '.ts' || ext === '.cts' || ext === '.mts') {
    return importWithJiti(filePath);
  }

  // For JS files, try native dynamic import
  try {
    const url = pathToFileUrl(filePath);
    const mod = await import(url);
    const config = mod.default ?? mod;
    return config;
  } catch {
    return importWithJiti(filePath);
  }
}

async function importWithJiti(filePath: string): Promise<DSScannerConfig> {
  try {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(import.meta.url, {
      interopDefault: true,
    });
    const mod = await jiti.import(filePath);
    const config = (mod as { default?: DSScannerConfig }) .default ?? (mod as DSScannerConfig);
    return config;
  } catch (err) {
    throw new Error(`jiti failed to load ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function pathToFileUrl(filePath: string): string {
  const resolved = path.resolve(filePath);
  // Windows path handling
  const normalized = resolved.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

function mergeWithDefaults(userConfig: DSScannerConfig): ResolvedConfig {
  return {
    repositories: userConfig.repositories,
    designSystems: userConfig.designSystems,
    include: userConfig.include ?? DEFAULT_CONFIG.include!,
    exclude: userConfig.exclude ?? DEFAULT_CONFIG.exclude!,
    localLibraryPatterns: userConfig.localLibraryPatterns ?? DEFAULT_CONFIG.localLibraryPatterns!,
    trackedThirdParty: userConfig.trackedThirdParty ?? DEFAULT_CONFIG.trackedThirdParty!,
    tsconfig: userConfig.tsconfig ?? DEFAULT_CONFIG.tsconfig!,
    historyDir: userConfig.historyDir ?? DEFAULT_CONFIG.historyDir!,
    output: {
      format: userConfig.output?.format ?? 'table',
      path: userConfig.output?.path,
      verbose: userConfig.output?.verbose ?? false,
    },
    thresholds: userConfig.thresholds ?? {},
  };
}

function validateConfig(config: ResolvedConfig, configPath: string): void {
  const errors: string[] = [];

  if (!Array.isArray(config.repositories) || config.repositories.length === 0) {
    errors.push('`repositories` must be a non-empty array of paths');
  }

  if (!Array.isArray(config.designSystems) || config.designSystems.length === 0) {
    errors.push('`designSystems` must be a non-empty array');
  } else {
    for (const ds of config.designSystems) {
      if (!ds.name) errors.push(`designSystem entry missing \`name\``);
      if (!Array.isArray(ds.packages) || ds.packages.length === 0) {
        errors.push(`designSystem "${ds.name}" must have at least one package`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(
      `Invalid config at ${configPath}:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
