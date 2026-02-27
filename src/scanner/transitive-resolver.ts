import fs from 'node:fs';
import path from 'node:path';
import { fdir } from 'fdir';
import type { CategorizedUsage } from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { parseFile } from './parser.js';
import { findDesignSystem, matchesPackage } from './categorizer.js';

export interface TransitiveDetection {
  dsName: string;
  coverage: number;
  source: 'auto-detected';
}

const MAX_PKG_FILES = 300;

/**
 * Enriches usages with transitiveDS annotations.
 *
 * Two passes:
 * 1. local-library without annotation → parse component source file, check DS imports (per-component)
 * 2. third-party with declarative annotation where rule has no explicit coverage →
 *    scan node_modules package directory, compute coverage = DS_files / total_files (per-package)
 *
 * Only runs when config.transitiveAdoption.enabled = true.
 * Declarative annotation with explicit coverage is never overwritten.
 *
 * @param usages    - All categorized usages for a repository
 * @param config    - Resolved scanner config
 * @param repoRoot  - Absolute path to the repository root (used to locate node_modules)
 * @param cache     - Per-repo cache: resolvedPath → detection result (for local-library)
 */
export async function enrichWithTransitiveDS(
  usages: CategorizedUsage[],
  config: ResolvedConfig,
  repoRoot: string,
  cache: Map<string, TransitiveDetection | null> = new Map()
): Promise<CategorizedUsage[]> {
  if (!config.transitiveAdoption?.enabled) {
    return usages;
  }

  // Package-level cache: packageName → coverage ratio (null = couldn't determine)
  const pkgCoverageCache = new Map<string, number | null>();

  const result: CategorizedUsage[] = [];

  for (const usage of usages) {
    // Case 1: local-library without annotation → per-component auto-detect
    if (
      usage.category === 'local-library' &&
      usage.resolvedPath &&
      !usage.transitiveDS
    ) {
      const detection = await detectFromFile(usage.resolvedPath, config, cache);
      result.push(detection ? { ...usage, transitiveDS: detection } : usage);
      continue;
    }

    // Case 2: third-party with declarative annotation, but rule had no explicit coverage →
    // replace the default 1.0 with an auto-detected package-level ratio
    if (
      usage.category === 'third-party' &&
      usage.transitiveDS?.source === 'declared' &&
      usage.packageName
    ) {
      const rule = config.transitiveRules.find(r =>
        matchesPackage(usage.packageName!, r.package)
      );

      if (rule && rule.coverage === undefined) {
        const coverage = await detectPackageCoverage(
          usage.packageName,
          rule.backedBy,
          repoRoot,
          config,
          pkgCoverageCache
        );

        if (coverage === null) {
          // Couldn't scan package, no explicit coverage → don't count as transitive (conservative)
          const { transitiveDS: _removed, ...rest } = usage;
          result.push(rest as CategorizedUsage);
        } else if (coverage === 0) {
          // Package has no DS usage at all → remove the annotation
          const { transitiveDS: _removed, ...rest } = usage;
          result.push(rest as CategorizedUsage);
        } else {
          result.push({
            ...usage,
            transitiveDS: { dsName: rule.backedBy, coverage, source: 'auto-detected' },
          });
        }
        continue;
      }
    }

    result.push(usage);
  }

  return result;
}

// ─── Per-file detection (local-library) ──────────────────────────────────────

async function detectFromFile(
  resolvedPath: string,
  config: ResolvedConfig,
  cache: Map<string, TransitiveDetection | null>
): Promise<TransitiveDetection | null> {
  const cached = cache.get(resolvedPath);
  if (cached !== undefined) return cached;

  let detection: TransitiveDetection | null = null;

  try {
    const parseResult = await parseFile(resolvedPath);
    for (const [, entry] of parseResult.imports) {
      const dsName = findDesignSystem(entry.source, config);
      if (dsName) {
        detection = { dsName, coverage: 1.0, source: 'auto-detected' };
        break;
      }
    }
  } catch {
    detection = null;
  }

  cache.set(resolvedPath, detection);
  return detection;
}

// ─── Per-package detection (third-party node_modules) ────────────────────────

/**
 * Scans a node_modules package and returns the fraction of its source files
 * that import from the specified design system.
 *
 * Prefers TypeScript source (src/) over compiled ESM (es/) over CJS (lib/).
 * Returns null if the package directory cannot be found or scanned.
 */
async function detectPackageCoverage(
  packageName: string,
  dsName: string,
  repoRoot: string,
  config: ResolvedConfig,
  cache: Map<string, number | null>
): Promise<number | null> {
  if (cache.has(packageName)) return cache.get(packageName)!;

  const pkgRoot = findPackageRoot(packageName, repoRoot);
  if (!pkgRoot) {
    cache.set(packageName, null);
    return null;
  }

  const scanDir = pickScanDir(pkgRoot);
  if (!scanDir) {
    cache.set(packageName, null);
    return null;
  }

  try {
    const files = collectSourceFiles(scanDir);
    if (files.length === 0) {
      cache.set(packageName, null);
      return null;
    }

    let parsed = 0;
    let dsFiles = 0;

    for (const file of files) {
      try {
        const result = await parseFile(file);
        parsed++;
        const usesDs = [...result.imports.values()].some(
          entry => findDesignSystem(entry.source, config) === dsName
        );
        if (usesDs) dsFiles++;
      } catch {
        // Skip files that can't be parsed
      }
    }

    const coverage = parsed > 0 ? dsFiles / parsed : null;
    cache.set(packageName, coverage);
    return coverage;
  } catch {
    cache.set(packageName, null);
    return null;
  }
}

function findPackageRoot(packageName: string, repoRoot: string): string | null {
  const candidates = [
    path.join(repoRoot, 'node_modules', packageName),
    path.join(process.cwd(), 'node_modules', packageName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Picks the best directory to scan within a package:
 * src/ (TypeScript source) → es/ (compiled ESM) → lib/ (compiled CJS) → package root.
 */
function pickScanDir(pkgRoot: string): string | null {
  for (const sub of ['src', 'es', 'lib']) {
    const dir = path.join(pkgRoot, sub);
    if (fs.existsSync(dir)) return dir;
  }
  // Fall back to package root itself
  return fs.existsSync(pkgRoot) ? pkgRoot : null;
}

function collectSourceFiles(dir: string): string[] {
  const files = new fdir()
    .withFullPaths()
    .filter(filePath => {
      const ext = path.extname(filePath);
      return (
        (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs') &&
        !filePath.endsWith('.d.ts') &&
        !filePath.includes('.test.') &&
        !filePath.includes('.spec.')
      );
    })
    .exclude(dirName => dirName === '__tests__' || dirName === 'node_modules')
    .crawl(dir)
    .sync() as string[];

  return files.slice(0, MAX_PKG_FILES);
}
