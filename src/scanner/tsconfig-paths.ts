// src/scanner/tsconfig-paths.ts
// Shared tsconfig path-alias resolution (extracted from import-resolver.ts
// so that route resolvers and other modules can use it without instantiating
// the full ImportResolver).

import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';

export interface TsConfigPaths {
  baseUrl: string;
  paths: Record<string, string[]>;
}

/**
 * Read tsconfig.json and extract path mappings + baseUrl.
 * Returns null if tsconfig is missing or unreadable.
 */
export function readTsConfigPaths(
  repoRoot: string,
  tsconfigName: string = 'tsconfig.json'
): TsConfigPaths | null {
  const tsconfigPath = path.join(repoRoot, tsconfigName);
  if (!fs.existsSync(tsconfigPath)) return null;

  try {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) return null;

    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
    return {
      baseUrl: parsed.options.baseUrl ?? repoRoot,
      paths: parsed.options.paths ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a path alias (e.g. `@/pages/Home`) to an absolute file path.
 * Returns null if the specifier doesn't match any path mapping or the file
 * doesn't exist on disk.
 */
export function resolveAliasPath(
  specifier: string,
  tsConfigPaths: TsConfigPaths
): string | null {
  const { baseUrl, paths } = tsConfigPaths;

  for (const [pattern, targets] of Object.entries(paths)) {
    if (!matchesPathPattern(specifier, pattern)) continue;

    for (const target of targets) {
      const expanded = expandPathAlias(specifier, pattern, target);
      if (!expanded) continue;

      const resolved = path.resolve(baseUrl, expanded);

      // Try common extensions
      const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
      for (const ext of extensions) {
        const candidate = resolved + ext;
        if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function matchesPathPattern(source: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return source.startsWith(pattern.slice(0, -1));
  }
  return source === pattern;
}

function expandPathAlias(source: string, pattern: string, target: string): string | null {
  if (pattern.endsWith('*') && target.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    const remainder = source.slice(prefix.length);
    return target.slice(0, -1) + remainder;
  }
  if (source === pattern) {
    return target;
  }
  return null;
}
