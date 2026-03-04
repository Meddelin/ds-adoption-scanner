import path from 'node:path';
import type { CategorizedUsage, DSCatalog, ScanReport } from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { discoverFiles } from './file-discovery.js';
import { parseFile } from './parser.js';
import { ImportResolver } from './import-resolver.js';
import { categorizeUsage } from './categorizer.js';
import { enrichWithTransitiveDS } from './transitive-resolver.js';
import { preScanLibraries, type LibraryRegistry } from './library-prescan.js';
import { preScanDesignSystems } from './ds-prescan.js';
import { enrichWithFamily } from './family-resolver.js';
import { aggregateResults, type RepoScanData } from '../metrics/aggregator.js';

const CONCURRENCY_LIMIT = 16;
const VERSION = '0.1.0';

export interface ScanOptions {
  configPath: string;
  verbose?: boolean;
  onProgress?: (current: number, total: number, repoName: string) => void;
}

export async function runScan(
  config: ResolvedConfig,
  options: ScanOptions
): Promise<ScanReport> {
  const startTime = Date.now();

  // Stage 0: Pre-scan design systems configured with path/git → build family catalog
  let dsCatalog: DSCatalog = new Map();
  if (config.designSystems.some(ds => ds.path || ds.git)) {
    dsCatalog = await preScanDesignSystems(config, options.verbose);
  }

  // Stage 0.5: Pre-scan libraries configured with path/git for per-component DS detection
  // Receives dsCatalog so it can map library components to DS families
  let libraryRegistry: LibraryRegistry = new Map();
  if ((config.libraries ?? []).some(l => l.path || l.git)) {
    libraryRegistry = await preScanLibraries(config, dsCatalog, options.verbose);
  }

  // Stage 1: Discover files
  const discovered = await discoverFiles(config);

  const repoData: RepoScanData[] = [];
  let globalFileIndex = 0;
  const totalFiles = discovered.reduce((sum, d) => sum + d.totalFiles, 0);

  // Stage 2-4: Process each repository sequentially (one TS resolver per repo)
  for (const discovery of discovered) {
    const resolver = new ImportResolver(discovery.repository, config.tsconfig);
    const repoUsages: CategorizedUsage[] = [];
    const parseErrors: string[] = [];

    // Process files in parallel with concurrency limit
    await processWithConcurrency(
      discovery.files,
      CONCURRENCY_LIMIT,
      async (filePath) => {
        globalFileIndex++;
        options.onProgress?.(globalFileIndex, totalFiles, discovery.repositoryName);

        const parseResult = await parseFile(filePath);

        if (parseResult.errors.length > 0 && options.verbose) {
          for (const err of parseResult.errors) {
            console.warn(`[ds-scanner] ${filePath}: ${err}`);
          }
        }

        for (const usage of parseResult.jsxUsages) {
          const categorized = categorizeUsage(usage, config, resolver);
          repoUsages.push(categorized);
        }
      }
    );

    // Stage 4b: Enrich usages with transitive DS detection (registry + auto-scan)
    const transitiveCache = new Map();
    const transitiveUsages = await enrichWithTransitiveDS(
      repoUsages, config, discovery.repository, transitiveCache, libraryRegistry
    );

    // Stage 4.5: Enrich design-system usages with componentFamily from DS catalog
    const finalUsages = enrichWithFamily(transitiveUsages, dsCatalog);

    repoData.push({
      repositoryName: discovery.repositoryName,
      repositoryPath: discovery.repository,
      usages: finalUsages,
      filesScanned: discovery.totalFiles,
    });
  }

  const scanDurationMs = Date.now() - startTime;

  // Stage 5: Aggregate metrics
  const report = aggregateResults(repoData, config, {
    version: VERSION,
    configPath: options.configPath,
    scanDurationMs,
    dsCatalog,
  });

  // Attach library pre-scan summary when libraries[] were configured
  if (libraryRegistry.size > 0) {
    report.libraryPrescan = [];
    for (const [pkg, entry] of libraryRegistry) {
      const total = entry.componentMap.size;
      const dsBacked = [...entry.componentMap.values()].filter(e => e.isDSBacked).length;
      report.libraryPrescan.push({
        package: pkg,
        backedBy: entry.backedBy,
        totalComponents: total,
        dsBackedComponents: dsBacked,
      });
    }
  }

  // Attach DS pre-scan summary when designSystems[] were pre-scanned
  if (dsCatalog.size > 0) {
    const allUsages = repoData.flatMap(r => r.usages);
    report.dsPrescan = [];
    for (const [dsName, families] of dsCatalog) {
      const totalComponents = families.reduce((s, f) => s + f.components.length, 0);
      const usedFamilies = new Set(
        allUsages
          .filter(u => u.category === 'design-system' && u.dsName === dsName && u.componentFamily)
          .map(u => u.componentFamily!)
      );
      const coveragePct = families.length > 0
        ? (usedFamilies.size / families.length) * 100
        : 0;
      report.dsPrescan.push({
        dsName,
        totalFamilies: families.length,
        totalComponents,
        familiesCoveredInScan: usedFamilies.size,
        coveragePct,
      });
    }
  }

  return report;
}

async function processWithConcurrency<T>(
  items: T[],
  limit: number,
  processor: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) {
        await processor(item);
      }
    }
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
}
