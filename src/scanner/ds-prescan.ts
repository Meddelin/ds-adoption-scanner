import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fdir } from 'fdir';
import picomatch from 'picomatch';
import type { DesignSystemDef, ResolvedConfig } from '../config/schema.js';
import type { ComponentFamily, DSCatalog } from '../types.js';
import { parseFileExports } from './library-prescan.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DS_INCLUDE = ['**/*.tsx', '**/*.ts'];
const DEFAULT_DS_EXCLUDE = [
  '**/*.test.*', '**/*.spec.*', '**/*.stories.*',
  '**/node_modules/**', '**/dist/**', '**/build/**',
];

// Directory names considered "generic containers" — if a component file's
// immediate parent dir is one of these, use the component name as family name.
const GENERIC_DIRS = new Set(['src', 'components', 'lib', 'ui', 'source', 'index', 'shared']);

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Pre-scans all design systems configured with `path` or `git`.
 * Returns a DSCatalog mapping dsName → ComponentFamily[].
 * Called once before the main scan (Stage 0).
 */
export async function preScanDesignSystems(
  config: ResolvedConfig,
  verbose = false
): Promise<DSCatalog> {
  const catalog: DSCatalog = new Map();

  const toScan = config.designSystems.filter(ds => ds.path || ds.git);
  if (toScan.length === 0) return catalog;

  for (const ds of toScan) {
    const sourceDir = resolveDSSource(ds, config.historyDir, verbose);
    if (!sourceDir) continue;

    if (verbose) {
      console.log(`[ds-scanner] Pre-scanning DS "${ds.name}" at ${sourceDir}`);
    }

    try {
      const families = buildFamilyCatalog(sourceDir, ds, config);
      catalog.set(ds.name, families);

      if (verbose) {
        const totalComponents = families.reduce((s, f) => s + f.components.length, 0);
        console.log(
          `[ds-scanner] DS "${ds.name}": ${families.length} families, ` +
          `${totalComponents} components`
        );
      }
    } catch (err) {
      console.warn(
        `[ds-scanner] Warning: failed to pre-scan DS "${ds.name}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return catalog;
}

/**
 * Builds an O(1) lookup: dsName → Map<exportedComponentName, familyName>.
 * Used by enrichWithFamily to assign componentFamily in O(1) per usage.
 */
export function buildFamilyLookup(
  catalog: DSCatalog
): Map<string, Map<string, string>> {
  const lookup = new Map<string, Map<string, string>>();
  for (const [dsName, families] of catalog) {
    const nameToFamily = new Map<string, string>();
    for (const family of families) {
      for (const componentName of family.components) {
        nameToFamily.set(componentName, family.name);
      }
    }
    lookup.set(dsName, nameToFamily);
  }
  return lookup;
}

// ─── Source resolution ────────────────────────────────────────────────────────

function resolveDSSource(
  ds: DesignSystemDef,
  historyDir: string,
  verbose: boolean
): string | null {
  if (ds.path) {
    const resolved = path.resolve(ds.path);
    if (!fs.existsSync(resolved)) {
      console.warn(`[ds-scanner] Warning: DS path does not exist: ${resolved}`);
      return null;
    }
    return resolved;
  }

  if (ds.git) {
    return cloneDSSource(ds.name, ds.git, historyDir, verbose);
  }

  return null;
}

function cloneDSSource(
  dsName: string,
  gitUrl: string,
  historyDir: string,
  verbose: boolean
): string | null {
  const cacheDir = path.join(historyDir, '.ds-cache', sanitizeName(dsName));

  if (fs.existsSync(cacheDir)) {
    if (verbose) {
      console.log(`[ds-scanner] Using cached clone for DS "${dsName}" at ${cacheDir}`);
    }
    return cacheDir;
  }

  if (verbose) {
    console.log(`[ds-scanner] Cloning DS "${dsName}" from ${gitUrl}...`);
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
      `[ds-scanner] Warning: git clone failed for DS "${dsName}": ${stderr.trim()}`
    );
    try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return null;
  }

  return cacheDir;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-]/g, '_');
}

// ─── Catalog builder ──────────────────────────────────────────────────────────

export function buildFamilyCatalog(
  dsRoot: string,
  ds: DesignSystemDef,
  config: ResolvedConfig
): ComponentFamily[] {
  const files = discoverDSFiles(dsRoot, ds);
  if (files.length === 0) return [];

  // Pass 1: parse all files → ExportInfo (reuse parseFileExports from library-prescan)
  // We only need info.defined (locally defined exports), not the full re-export chain.
  // Barrel files only appear in info.reExports — so scanning info.defined avoids spurious families.
  const componentToSourceFile = new Map<string, string>();

  for (const filePath of files) {
    try {
      const code = fs.readFileSync(filePath, 'utf8');
      const info = parseFileExports(code, filePath, config);
      for (const name of info.defined) {
        if (!isPascalCase(name)) continue;
        // First-definition wins (avoids overwriting with barrel re-export location)
        if (!componentToSourceFile.has(name)) {
          componentToSourceFile.set(name, filePath);
        }
      }
    } catch {
      // Non-parseable file — skip silently
    }
  }

  // Pass 2: group by family
  return groupIntoFamilies(componentToSourceFile, dsRoot, ds.groupBy ?? 'directory');
}

function discoverDSFiles(dsRoot: string, ds: DesignSystemDef): string[] {
  const includePatterns = ds.include ?? DEFAULT_DS_INCLUDE;
  const excludePatterns = ds.exclude ?? DEFAULT_DS_EXCLUDE;

  const isIncluded = picomatch(includePatterns, { dot: true });
  const isExcluded = picomatch(excludePatterns, { dot: true });

  const crawler = new fdir()
    .withFullPaths()
    .filter((filePath) => {
      const rel = filePath.replace(/\\/g, '/').slice(dsRoot.replace(/\\/g, '/').length + 1);
      return isIncluded(rel) && !isExcluded(rel);
    })
    .crawl(dsRoot);

  return crawler.sync() as string[];
}

// ─── Family grouping ──────────────────────────────────────────────────────────

function groupIntoFamilies(
  componentToSourceFile: Map<string, string>,
  dsRoot: string,
  groupBy: 'directory' | 'none'
): ComponentFamily[] {
  if (groupBy === 'none') {
    return Array.from(componentToSourceFile.entries()).map(([name, filePath]) => ({
      name,
      components: [name],
      files: [filePath],
    }));
  }

  // groupBy === 'directory': family = immediate parent directory name
  const familyMap = new Map<string, { components: string[]; files: Set<string> }>();

  for (const [componentName, filePath] of componentToSourceFile) {
    const familyName = getFamilyName(filePath, dsRoot, componentName);

    if (!familyMap.has(familyName)) {
      familyMap.set(familyName, { components: [], files: new Set() });
    }
    const entry = familyMap.get(familyName)!;
    entry.components.push(componentName);
    entry.files.add(filePath);
  }

  return Array.from(familyMap.entries())
    .map(([name, data]) => ({
      name,
      components: data.components.sort(),
      files: Array.from(data.files),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getFamilyName(filePath: string, dsRoot: string, componentName: string): string {
  const dsRootNorm = path.resolve(dsRoot);
  const fileDir = path.resolve(path.dirname(filePath));

  // File is directly in the DS root → family = component name
  const rel = path.relative(dsRootNorm, fileDir);
  if (!rel || rel === '.') return componentName;

  // Split the relative path into segments, skip any leading GENERIC_DIRS, and
  // take the first non-generic segment as the family name.
  // This works at any nesting depth:
  //   Button/Button.tsx                     → "Button"
  //   EmptyState/EmptyStateButton/Btn.tsx   → "EmptyState"
  //   EmptyState/src/EmptyStateNoData.tsx   → "EmptyState"
  //   src/components/Button/Button.tsx      → "Button"
  //   src/Button.tsx                        → componentName (all segments are generic)
  const segments = rel.split(path.sep).filter(Boolean);
  let i = 0;
  while (i < segments.length && GENERIC_DIRS.has(segments[i].toLowerCase())) {
    i++;
  }
  if (i >= segments.length) return componentName;

  return segments[i];
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}
