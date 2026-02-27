import fs from 'node:fs';
import path from 'node:path';
import type { CategorizedUsage } from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { parseFile } from './parser.js';
import { findDesignSystem, matchesPackage } from './categorizer.js';

export interface TransitiveDetection {
  dsName: string;
  coverage: number;
  source: 'auto-detected';
}

/**
 * Enriches usages with transitiveDS annotations.
 *
 * Two passes:
 * 1. local-library without annotation → parse component source file, check DS imports (per-component)
 * 2. third-party with declarative annotation where rule has no explicit coverage →
 *    check package.json deps/peerDeps: if DS package listed → coverage 1.0 (per-package)
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
 * Checks whether a node_modules package declares a DS package in its
 * dependencies or peerDependencies. If yes → coverage 1.0.
 * If package.json not found → null (skip, don't count).
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

  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')
    ) as Record<string, unknown>;

    const allDeps = {
      ...pkgJson['dependencies'] as Record<string, string> | undefined,
      ...pkgJson['peerDependencies'] as Record<string, string> | undefined,
      ...pkgJson['optionalDependencies'] as Record<string, string> | undefined,
    };

    const ds = config.designSystems.find(d => d.name === dsName);
    const isDsBacked = ds?.packages.some(pkg => pkg in allDeps) ?? false;

    const coverage = isDsBacked ? 1.0 : 0;
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
