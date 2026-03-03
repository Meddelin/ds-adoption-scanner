import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { fdir } from 'fdir';
import picomatch from 'picomatch';
import type { LibrarySource, ResolvedConfig } from '../config/schema.js';
import { findDesignSystem } from './categorizer.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export type LibraryRegistry = Map<string, {
  componentMap: Map<string, boolean>; // componentName → isDSBacked
  backedBy: string;
}>;

// ─── Internal types ───────────────────────────────────────────────────────────

interface ExportInfo {
  defined: Set<string>;                                      // locally defined+exported names
  reExports: Array<{ name: string | '*'; from: string }>;   // re-exports from other files
  hasDSImport: boolean;
  dsName: string | null;
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Pre-scans all libraries configured with `path` or `git`.
 * Returns a registry keyed by package name. Called once before the main scan.
 */
export async function preScanLibraries(
  config: ResolvedConfig,
  verbose = false
): Promise<LibraryRegistry> {
  const registry: LibraryRegistry = new Map();

  const toScan = config.libraries.filter(lib => lib.path || lib.git);
  if (toScan.length === 0) return registry;

  for (const lib of toScan) {
    const sourceDir = await resolveLibrarySource(lib, config.historyDir, verbose);
    if (!sourceDir) continue;

    if (verbose) {
      console.log(`[ds-scanner] Pre-scanning library "${lib.package}" at ${sourceDir}`);
    }

    try {
      const componentMap = await buildComponentMap(sourceDir, lib, config);
      registry.set(lib.package, { componentMap, backedBy: lib.backedBy });

      if (verbose) {
        const total = componentMap.size;
        const backed = [...componentMap.values()].filter(Boolean).length;
        console.log(
          `[ds-scanner] Library "${lib.package}": ${backed}/${total} components backed by "${lib.backedBy}"`
        );
      }
    } catch (err) {
      console.warn(
        `[ds-scanner] Warning: failed to pre-scan library "${lib.package}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return registry;
}

// ─── Source resolution ────────────────────────────────────────────────────────

async function resolveLibrarySource(
  lib: LibrarySource,
  historyDir: string,
  verbose: boolean
): Promise<string | null> {
  if (lib.path) {
    const resolved = path.resolve(lib.path);
    if (!fs.existsSync(resolved)) {
      console.warn(`[ds-scanner] Warning: library path does not exist: ${resolved}`);
      return null;
    }
    return resolved;
  }

  if (lib.git) {
    return cloneLibrary(lib.package, lib.git, historyDir, verbose);
  }

  return null;
}

function cloneLibrary(
  packageName: string,
  gitUrl: string,
  historyDir: string,
  verbose: boolean
): string | null {
  const cacheDir = path.join(historyDir, '.library-cache', sanitizePackageName(packageName));

  if (fs.existsSync(cacheDir)) {
    if (verbose) {
      console.log(`[ds-scanner] Using cached clone for "${packageName}" at ${cacheDir}`);
    }
    return cacheDir;
  }

  if (verbose) {
    console.log(`[ds-scanner] Cloning "${packageName}" from ${gitUrl}...`);
  }

  fs.mkdirSync(cacheDir, { recursive: true });

  const result = spawnSync(
    'git',
    ['clone', '--depth', '1', '--single-branch', gitUrl, cacheDir],
    { stdio: verbose ? 'inherit' : 'pipe', encoding: 'utf8' }
  );

  if (result.status !== 0) {
    const stderr = result.stderr ?? '';
    console.warn(
      `[ds-scanner] Warning: git clone failed for "${packageName}": ${stderr.trim()}`
    );
    // Clean up failed clone dir
    try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return null;
  }

  return cacheDir;
}

function sanitizePackageName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-]/g, '_');
}

// ─── Component map builder ────────────────────────────────────────────────────

const DEFAULT_INCLUDE = ['**/*.tsx', '**/*.ts'];
const DEFAULT_EXCLUDE = [
  '**/*.test.*', '**/*.spec.*', '**/*.stories.*',
  '**/node_modules/**', '**/dist/**', '**/build/**',
];

async function buildComponentMap(
  libRoot: string,
  lib: LibrarySource,
  config: ResolvedConfig
): Promise<Map<string, boolean>> {
  const files = discoverLibraryFiles(libRoot, lib);
  if (files.length === 0) return new Map();

  // Pass 1: parse all files → ExportInfo
  const allInfo = new Map<string, ExportInfo>();
  for (const filePath of files) {
    try {
      const code = fs.readFileSync(filePath, 'utf8');
      const info = parseFileExports(code, filePath, config);
      allInfo.set(filePath, info);
    } catch {
      // Non-parseable file (e.g. JS without types) — skip silently
    }
  }

  // Pass 2: resolve the full export chain for each file via DFS
  const resolveCache = new Map<string, Map<string, boolean>>();
  const componentMap = new Map<string, boolean>();

  for (const filePath of files) {
    const resolved = resolveFileExports(filePath, allInfo, resolveCache, new Set(), libRoot);
    for (const [name, isDSBacked] of resolved) {
      // If the same component is exported from multiple files, mark as backed if ANY file backs it
      if (!componentMap.has(name) || isDSBacked) {
        componentMap.set(name, isDSBacked);
      }
    }
  }

  return componentMap;
}

function discoverLibraryFiles(libRoot: string, lib: LibrarySource): string[] {
  const includePatterns = lib.include ?? DEFAULT_INCLUDE;
  const excludePatterns = lib.exclude ?? DEFAULT_EXCLUDE;

  const isIncluded = picomatch(includePatterns, { dot: true });
  const isExcluded = picomatch(excludePatterns, { dot: true });

  const crawler = new fdir()
    .withFullPaths()
    .filter((filePath) => {
      const rel = filePath.replace(/\\/g, '/').slice(libRoot.replace(/\\/g, '/').length + 1);
      return isIncluded(rel) && !isExcluded(rel);
    })
    .crawl(libRoot);

  return crawler.sync() as string[];
}

// ─── Export info extraction ───────────────────────────────────────────────────

export function parseFileExports(
  code: string,
  filePath: string,
  config: ResolvedConfig
): ExportInfo {
  const info: ExportInfo = {
    defined: new Set(),
    reExports: [],
    hasDSImport: false,
    dsName: null,
  };

  let ast: TSESTree.Program;
  try {
    ast = parse(code, {
      jsx: filePath.endsWith('.tsx') || filePath.endsWith('.jsx'),
      tolerant: true,
    });
  } catch {
    return info;
  }

  for (const node of ast.body) {
    // ── Import declarations: detect DS imports ─────────────────────────────
    if (node.type === 'ImportDeclaration') {
      const source = node.source.value as string;
      const dsName = findDesignSystem(source, config);
      if (dsName) {
        info.hasDSImport = true;
        info.dsName = dsName;
      }
      continue;
    }

    // ── export { A, B } or export { A } from './path' ─────────────────────
    if (node.type === 'ExportNamedDeclaration') {
      if (node.source) {
        // Re-export from another module
        const from = node.source.value as string;
        if (node.specifiers.length === 0) {
          // export * from './path' — handled by ExportAllDeclaration, but
          // some parsers emit it here; treat as star
          info.reExports.push({ name: '*', from });
        } else {
          for (const spec of node.specifiers) {
            const exportedName = spec.exported.type === 'Identifier'
              ? spec.exported.name
              : (spec.exported as TSESTree.Literal).value as string;
            info.reExports.push({ name: exportedName, from });
          }
        }
      } else if (node.declaration) {
        // export function Foo() {} / export const Foo = ... / export class Foo {}
        extractDeclaredNames(node.declaration).forEach(n => info.defined.add(n));
      } else {
        // export { Foo, Bar } — locally defined aliases (no source)
        for (const spec of node.specifiers) {
          const exportedName = spec.exported.type === 'Identifier'
            ? spec.exported.name
            : (spec.exported as TSESTree.Literal).value as string;
          info.defined.add(exportedName);
        }
      }
      continue;
    }

    // ── export * from './path' ─────────────────────────────────────────────
    if (node.type === 'ExportAllDeclaration') {
      const from = node.source.value as string;
      if (node.exported) {
        // export * as Namespace from './path'
        const nsName = node.exported.type === 'Identifier'
          ? node.exported.name
          : (node.exported as TSESTree.Literal).value as string;
        info.defined.add(nsName);
        // The namespace itself is "backed" if the underlying file is backed —
        // we handle this in resolveFileExports via the reExport chain.
        // Register it as a named re-export of '*' so the resolver can unwrap it.
        info.reExports.push({ name: nsName, from });
      } else {
        info.reExports.push({ name: '*', from });
      }
      continue;
    }

    // ── export default ─────────────────────────────────────────────────────
    if (node.type === 'ExportDefaultDeclaration') {
      info.defined.add('default');
    }
  }

  return info;
}

function extractDeclaredNames(decl: TSESTree.Declaration): string[] {
  switch (decl.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return decl.id ? [decl.id.name] : [];

    case 'VariableDeclaration':
      return decl.declarations.flatMap(d =>
        d.id.type === 'Identifier' ? [d.id.name] : []
      );

    case 'TSEnumDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
      return [decl.id.name];

    case 'TSModuleDeclaration':
      return decl.id.type === 'Identifier' ? [decl.id.name] : [];

    default:
      return [];
  }
}

// ─── DFS export resolver ──────────────────────────────────────────────────────

/**
 * Returns a Map<componentName, isDSBacked> for a given file,
 * following re-export chains recursively (with cycle detection).
 */
function resolveFileExports(
  filePath: string,
  allInfo: Map<string, ExportInfo>,
  cache: Map<string, Map<string, boolean>>,
  visited: Set<string>,
  libRoot: string
): Map<string, boolean> {
  if (cache.has(filePath)) return cache.get(filePath)!;

  const result = new Map<string, boolean>();
  cache.set(filePath, result); // set early to handle cycles

  if (visited.has(filePath)) return result;
  visited.add(filePath);

  const info = allInfo.get(filePath);
  if (!info) {
    visited.delete(filePath);
    return result;
  }

  // Locally defined exports: backed if this file has a DS import
  for (const name of info.defined) {
    result.set(name, info.hasDSImport);
  }

  // Re-exports: resolve each 'from' path
  for (const reExport of info.reExports) {
    const resolvedPath = resolveRelativePath(reExport.from, filePath, libRoot, allInfo);
    if (!resolvedPath) continue;

    const childExports = resolveFileExports(resolvedPath, allInfo, cache, visited, libRoot);

    if (reExport.name === '*') {
      // Merge all child exports
      for (const [name, backed] of childExports) {
        if (!result.has(name) || backed) {
          result.set(name, backed);
        }
      }
    } else {
      const backed = childExports.get(reExport.name) ?? info.hasDSImport;
      if (!result.has(reExport.name) || backed) {
        result.set(reExport.name, backed);
      }
    }
  }

  visited.delete(filePath);
  return result;
}

/**
 * Resolves a relative import specifier to an absolute path present in allInfo.
 * Tries common TypeScript extensions in order.
 */
function resolveRelativePath(
  from: string,
  containingFile: string,
  libRoot: string,
  allInfo: Map<string, ExportInfo>
): string | null {
  // Only resolve relative paths (inter-library imports are excluded by design)
  if (!from.startsWith('.') && !from.startsWith('/')) return null;

  const base = path.resolve(path.dirname(containingFile), from);

  // Try exact path first, then common extensions and index files
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
  ];

  for (const candidate of candidates) {
    if (allInfo.has(candidate)) return candidate;
    // Normalise path separators for Windows
    const normalized = candidate.replace(/\\/g, '/');
    for (const key of allInfo.keys()) {
      if (key.replace(/\\/g, '/') === normalized) return key;
    }
  }

  // Path is outside libRoot or not in discovered files — skip
  return null;
}
