import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';
import type { ResolvedImport } from '../types.js';

export class ImportResolver {
  private cache = new Map<string, ResolvedImport>();
  private compilerOptions: ts.CompilerOptions;
  private resolutionCache: ts.ModuleResolutionCache;
  private repoRoot: string;

  constructor(repoRoot: string, tsconfigName: string = 'tsconfig.json') {
    this.repoRoot = repoRoot;

    const tsconfigPath = path.join(repoRoot, tsconfigName);
    this.compilerOptions = this.loadCompilerOptions(tsconfigPath, repoRoot);
    this.resolutionCache = ts.createModuleResolutionCache(
      repoRoot,
      (x) => x,
      this.compilerOptions
    );
  }

  private loadCompilerOptions(tsconfigPath: string, repoRoot: string): ts.CompilerOptions {
    if (!fs.existsSync(tsconfigPath)) {
      // Fall back to defaults
      return {
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        esModuleInterop: true,
      };
    }

    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      console.warn(`[ds-scanner] Failed to read tsconfig at ${tsconfigPath}`);
      return {};
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      repoRoot
    );

    return parsed.options;
  }

  resolve(source: string, containingFile: string): ResolvedImport {
    const cacheKey = `${source}::${containingFile}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = this.doResolve(source, containingFile);
    this.cache.set(cacheKey, result);
    return result;
  }

  private doResolve(source: string, containingFile: string): ResolvedImport {
    // Check if it's a node module (not relative, not absolute)
    if (!source.startsWith('.') && !source.startsWith('/')) {
      // Could be an aliased path from tsconfig paths
      const aliasResolved = this.resolveAlias(source, containingFile);
      if (aliasResolved) {
        return aliasResolved;
      }

      // It's a node module — extract package name
      const packageName = extractPackageName(source);
      return {
        originalSource: source,
        resolvedPath: null,
        isNodeModule: true,
        packageName,
      };
    }

    // Relative or absolute import — resolve via TypeScript
    try {
      const result = ts.resolveModuleName(
        source,
        containingFile,
        this.compilerOptions,
        ts.sys,
        this.resolutionCache
      );

      if (result.resolvedModule) {
        const resolvedPath = result.resolvedModule.resolvedFileName;
        return {
          originalSource: source,
          resolvedPath,
          isNodeModule: result.resolvedModule.isExternalLibraryImport ?? false,
          packageName: result.resolvedModule.isExternalLibraryImport
            ? extractPackageName(source)
            : null,
        };
      }
    } catch {
      // Fall through to unresolved
    }

    return {
      originalSource: source,
      resolvedPath: null,
      isNodeModule: false,
      packageName: null,
    };
  }

  private resolveAlias(source: string, containingFile: string): ResolvedImport | null {
    const paths = this.compilerOptions.paths;
    if (!paths) return null;

    for (const [pattern, targets] of Object.entries(paths)) {
      if (matchesPathPattern(source, pattern)) {
        for (const target of targets) {
          const resolved = expandPathAlias(source, pattern, target, this.repoRoot);
          if (resolved && fs.existsSync(resolved)) {
            return {
              originalSource: source,
              resolvedPath: resolved,
              isNodeModule: false,
              packageName: null,
            };
          }
        }
      }
    }

    return null;
  }
}

function extractPackageName(source: string): string {
  // Handle scoped packages: @scope/name/sub/path → @scope/name
  if (source.startsWith('@')) {
    const parts = source.split('/');
    return parts.slice(0, 2).join('/');
  }
  // Handle regular packages: name/sub/path → name
  return source.split('/')[0]!;
}

function matchesPathPattern(source: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return source.startsWith(pattern.slice(0, -1));
  }
  return source === pattern;
}

function expandPathAlias(
  source: string,
  pattern: string,
  target: string,
  repoRoot: string
): string | null {
  let expanded: string;

  if (pattern.endsWith('*') && target.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    const remainder = source.slice(prefix.length);
    expanded = target.slice(0, -1) + remainder;
  } else {
    expanded = target;
  }

  // Resolve relative to baseUrl or repoRoot
  const resolved = path.resolve(repoRoot, expanded);

  // Try common extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
