import type { CategorizedUsage } from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { parseFile } from './parser.js';
import { findDesignSystem } from './categorizer.js';

export interface TransitiveDetection {
  dsName: string;
  coverage: number;
  source: 'auto-detected';
}

/**
 * Enriches local-library usages with transitiveDS by parsing their source files
 * and checking for DS imports. Only runs when config.transitiveAdoption.enabled = true.
 * Declarative transitiveDS (already set by categorizer) is never overwritten.
 *
 * @param usages - All categorized usages for a repository
 * @param config - Resolved scanner config
 * @param cache  - Per-repo cache: resolvedPath → detection result
 */
export async function enrichWithTransitiveDS(
  usages: CategorizedUsage[],
  config: ResolvedConfig,
  cache: Map<string, TransitiveDetection | null> = new Map()
): Promise<CategorizedUsage[]> {
  if (!config.transitiveAdoption?.enabled) {
    return usages;
  }

  const result: CategorizedUsage[] = [];

  for (const usage of usages) {
    // Only auto-detect for local-library with a known source path
    if (
      usage.category !== 'local-library' ||
      !usage.resolvedPath ||
      usage.transitiveDS  // declarative rule already applied — skip
    ) {
      result.push(usage);
      continue;
    }

    const detection = await detectTransitiveDS(usage.resolvedPath, config, cache);
    if (detection) {
      result.push({ ...usage, transitiveDS: detection });
    } else {
      result.push(usage);
    }
  }

  return result;
}

async function detectTransitiveDS(
  resolvedPath: string,
  config: ResolvedConfig,
  cache: Map<string, TransitiveDetection | null>
): Promise<TransitiveDetection | null> {
  const cached = cache.get(resolvedPath);
  if (cached !== undefined) return cached;

  let detection: TransitiveDetection | null = null;

  try {
    const parseResult = await parseFile(resolvedPath);

    // Check each import in the source file against configured design systems
    for (const [, entry] of parseResult.imports) {
      const dsName = findDesignSystem(entry.source, config);
      if (dsName) {
        detection = { dsName, coverage: 1.0, source: 'auto-detected' };
        break; // First DS match wins
      }
    }
  } catch {
    // If we can't parse the file, treat as non-DS-backed
    detection = null;
  }

  cache.set(resolvedPath, detection);
  return detection;
}
