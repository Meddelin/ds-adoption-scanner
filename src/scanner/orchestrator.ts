import path from 'node:path';
import type { CategorizedUsage, ScanReport } from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { discoverFiles } from './file-discovery.js';
import { parseFile } from './parser.js';
import { ImportResolver } from './import-resolver.js';
import { categorizeUsage } from './categorizer.js';
import { enrichWithTransitiveDS } from './transitive-resolver.js';
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

    // Stage 4b: Enrich usages with transitive DS detection (auto-scan)
    const transitiveCache = new Map();
    const finalUsages = await enrichWithTransitiveDS(repoUsages, config, discovery.repository, transitiveCache);

    repoData.push({
      repositoryName: discovery.repositoryName,
      repositoryPath: discovery.repository,
      usages: finalUsages,
      filesScanned: discovery.totalFiles,
    });
  }

  const scanDurationMs = Date.now() - startTime;

  // Stage 5: Aggregate metrics
  return aggregateResults(repoData, config, {
    version: VERSION,
    configPath: options.configPath,
    scanDurationMs,
  });
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
