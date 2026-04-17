import path from 'node:path';
import type { CategorizedUsage, DSCatalog } from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { discoverFiles } from './file-discovery.js';
import { parseFile } from './parser.js';
import { ImportResolver } from './import-resolver.js';
import { categorizeUsage } from './categorizer.js';
import { enrichWithTransitiveDS } from './transitive-resolver.js';
import { preScanLibraries, type LibraryRegistry } from './library-prescan.js';
import { preScanDesignSystems } from './ds-prescan.js';
import { enrichWithFamily } from './family-resolver.js';

const CONCURRENCY_LIMIT = 16;

export interface RepoScanData {
  repositoryName: string;
  repositoryPath: string;
  usages: CategorizedUsage[];
  filesScanned: number;
}

export interface ScanOptions {
  configPath: string;
  verbose?: boolean;
  onProgress?: (current: number, total: number, repoName: string) => void;
}

export interface ScanPipelineResult {
  repoData: RepoScanData[];
  dsCatalog: DSCatalog;
  libraryRegistry: LibraryRegistry;
  filesScanned: number;
}

export async function executeScanPipeline(
  config: ResolvedConfig,
  options: ScanOptions
): Promise<ScanPipelineResult> {
  // Stage 0: Pre-scan design systems configured with path/git → build family catalog
  let dsCatalog: DSCatalog = new Map();
  if (config.designSystems.some(ds => ds.path || ds.git)) {
    dsCatalog = await preScanDesignSystems(config, options.verbose);
  }

  // Stage 0.5: Pre-scan libraries configured with path/git for per-component DS detection
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

  return {
    repoData,
    dsCatalog,
    libraryRegistry,
    filesScanned: totalFiles,
  };
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
