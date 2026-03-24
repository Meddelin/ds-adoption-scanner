import fs from 'node:fs';
import path from 'node:path';
import type { CategorizedUsage } from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { parseFile } from './parser.js';
import { findDesignSystem, matchesPackage } from './categorizer.js';
import type { LibraryRegistry, LibraryComponentEntry, LibraryFamilyEntry } from './library-prescan.js';

export interface TransitiveDetection {
  dsName: string;
  coverage: number;
  source: 'auto-detected';
}

/**
 * Enriches usages with transitiveDS annotations.
 *
 * Priority order:
 * 0. pre-scanned library registry (per-component, highest accuracy) — always runs when libraries[] configured
 * 1. local-library without annotation → parse component source file, check DS imports (per-component)
 * 2. third-party with declarative annotation where rule has no explicit coverage →
 *    check package.json deps/peerDeps: if DS package listed → coverage 1.0 (per-package)
 *
 * Passes 1–2 only run when config.transitiveAdoption.enabled = true.
 * Declarative annotation with explicit coverage is never overwritten (unless registry overrides).
 *
 * @param usages           - All categorized usages for a repository
 * @param config           - Resolved scanner config
 * @param repoRoot         - Absolute path to the repository root (used to locate node_modules)
 * @param cache            - Per-repo cache: resolvedPath → detection result (for local-library)
 * @param libraryRegistry  - Pre-scanned component maps from libraries[] config
 */
export async function enrichWithTransitiveDS(
  usages: CategorizedUsage[],
  config: ResolvedConfig,
  repoRoot: string,
  cache: Map<string, TransitiveDetection | null> = new Map(),
  libraryRegistry: LibraryRegistry = new Map()
): Promise<CategorizedUsage[]> {
  const hasRegistry = libraryRegistry.size > 0;
  const hasAutoScan = config.transitiveAdoption?.enabled;

  if (!hasRegistry && !hasAutoScan) {
    return usages;
  }

  // Package-level cache: packageName → coverage ratio (null = couldn't determine)
  const pkgCoverageCache = new Map<string, number | null>();

  const result: CategorizedUsage[] = [];

  for (const usage of usages) {
    // Case 0: pre-scanned library registry — per-component, takes priority.
    // packageName can be null for local-library usages that resolve via path aliases (isNodeModule=false).
    // In that case, fall back to extracting the package name from importEntry.source.
    if (
      hasRegistry &&
      (usage.category === 'third-party' || usage.category === 'local-library')
    ) {
      const lookupName = usage.packageName
        ?? (usage.importEntry?.source
          ? extractPackageFromSource(usage.importEntry.source)
          : null);
      if (!lookupName) {
        result.push(usage);
        continue;
      }
      const libEntry = findRegistryEntry(libraryRegistry, lookupName);
      if (libEntry !== null) {
        const compEntry = libEntry.componentMap.get(usage.componentName);
        let isDSBacked = compEntry?.isDSBacked ?? false;
        const componentKnown = compEntry !== undefined; // explicitly indexed during prescan

        // Family fallback A: component not indexed but resolvedPath available → check familyMap by path
        if (!isDSBacked && usage.resolvedPath && libEntry.libBase) {
          const rel = path.relative(libEntry.libBase, path.dirname(usage.resolvedPath));
          const familySegment = rel.split(path.sep)[0];
          if (familySegment && !familySegment.startsWith('..')) {
            isDSBacked = libEntry.familyMap.get(familySegment)?.isDSBacked ?? false;
          }
        }

        // Family fallback B: path-based fallback failed → derive family from component name prefix
        // Converts kebab-case family keys to CamelCase and checks if componentName starts with that prefix.
        // E.g. familyMap key "empty-state" → prefix "EmptyState" matches "EmptyStateNoData".
        if (!isDSBacked && libEntry.familyMap.size > 0) {
          for (const [familyKey, familyEntry] of libEntry.familyMap) {
            if (!familyEntry.isDSBacked) continue;
            const camelPrefix = familyKey
              .split(/[-_]/)
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join('');
            if (usage.componentName.startsWith(camelPrefix)) {
              isDSBacked = true;
              break;
            }
          }
        }

        if (isDSBacked) {
          result.push({
            ...usage,
            transitiveDS: { dsName: libEntry.backedBy, coverage: 1.0, source: 'auto-detected', libraryPackage: lookupName },
            ...(compEntry?.dsFamily ? { componentFamily: compEntry.dsFamily } : {}),
          });
          continue;
        }

        if (componentKnown) {
          // Component is explicitly indexed as NOT DS-backed → strip any declarative annotation
          const { transitiveDS: _removed, ...rest } = usage;
          result.push(rest as CategorizedUsage);
          continue;
        }

        // Component is unknown (not indexed by prescan) → fall through to Case 1 auto-detect
        // rather than assuming it's not DS-backed
      }
    }

    // Case 1: local-library without annotation → per-component auto-detect
    if (
      hasAutoScan &&
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
      hasAutoScan &&
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

  // Gap 3B: propagate family DS-backing for auto-detect (Case 1).
  // If any local-library usage in a directory was auto-detected as DS-backed,
  // mark all sibling usages in the same directory (same family) as backed too.
  if (hasAutoScan) {
    const dirToDSName = new Map<string, string>();
    for (const u of result) {
      if (u.category === 'local-library' && u.transitiveDS?.source === 'auto-detected' && u.resolvedPath) {
        dirToDSName.set(path.dirname(u.resolvedPath), u.transitiveDS.dsName);
      }
    }
    for (let i = 0; i < result.length; i++) {
      const u = result[i]!;
      if (u.category === 'local-library' && !u.transitiveDS && u.resolvedPath) {
        const dsName = dirToDSName.get(path.dirname(u.resolvedPath));
        if (dsName) {
          result[i] = { ...u, transitiveDS: { dsName, coverage: 1.0, source: 'auto-detected' } };
        }
      }
    }
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

// ─── Library registry helpers ─────────────────────────────────────────────────

function findRegistryEntry(
  registry: LibraryRegistry,
  packageName: string
): { componentMap: Map<string, LibraryComponentEntry>; familyMap: Map<string, LibraryFamilyEntry>; backedBy: string; libBase: string } | null {
  // Exact match first
  if (registry.has(packageName)) return registry.get(packageName)!;
  // Pattern match (supports globs like '@company/*')
  for (const [pattern, entry] of registry) {
    if (matchesPackage(packageName, pattern)) return entry;
  }
  return null;
}

/** Extract bare package name from an import source, stripping subpaths.
 *  '@scope/pkg/sub/path' → '@scope/pkg'
 *  'pkg/sub/path' → 'pkg'
 *  './relative' → null (not a package) */
function extractPackageFromSource(source: string): string | null {
  if (source.startsWith('.') || source.startsWith('/')) return null;
  if (source.startsWith('@')) {
    const parts = source.split('/');
    if (parts.length < 2) return null;
    return parts.slice(0, 2).join('/');
  }
  return source.split('/')[0] ?? null;
}
