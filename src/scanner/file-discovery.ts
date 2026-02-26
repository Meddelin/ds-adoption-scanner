import path from 'node:path';
import fs from 'node:fs';
import { fdir } from 'fdir';
import picomatch from 'picomatch';
import type { ResolvedConfig } from '../config/schema.js';
import type { DiscoveryResult } from '../types.js';

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export async function discoverFiles(config: ResolvedConfig): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];

  for (const repoPath of config.repositories) {
    const resolved = path.resolve(repoPath);

    if (!fs.existsSync(resolved)) {
      console.warn(`[ds-scanner] Repository not found, skipping: ${resolved}`);
      continue;
    }

    const files = await crawlRepository(resolved, config);
    const repositoryName = path.basename(resolved);

    results.push({
      repository: resolved,
      repositoryName,
      files,
      totalFiles: files.length,
    });
  }

  return results;
}

async function crawlRepository(
  repoRoot: string,
  config: ResolvedConfig
): Promise<string[]> {
  const includeMatchers = config.include.map(pattern =>
    picomatch(pattern, { dot: true })
  );
  const excludeMatchers = config.exclude.map(pattern =>
    picomatch(pattern, { dot: true })
  );

  const allFiles = await new fdir()
    .withFullPaths()
    .filter((filePath) => {
      const ext = path.extname(filePath);
      if (!SUPPORTED_EXTENSIONS.has(ext)) return false;

      // Get path relative to repo root for pattern matching
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

      // Check exclude patterns first
      for (const isExcluded of excludeMatchers) {
        if (isExcluded(relativePath) || isExcluded(filePath.replace(/\\/g, '/'))) {
          return false;
        }
      }

      // Check include patterns
      if (includeMatchers.length === 0) return true;
      for (const isIncluded of includeMatchers) {
        if (isIncluded(relativePath) || isIncluded(filePath.replace(/\\/g, '/'))) {
          return true;
        }
      }

      return false;
    })
    .crawl(repoRoot)
    .withPromise();

  return allFiles as string[];
}
