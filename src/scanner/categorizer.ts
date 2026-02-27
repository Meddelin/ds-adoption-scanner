import picomatch from 'picomatch';
import type { JSXUsageRecord, CategorizedUsage, ComponentCategory } from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import type { ImportResolver } from './import-resolver.js';

export function categorizeUsage(
  usage: JSXUsageRecord,
  config: ResolvedConfig,
  resolver: ImportResolver
): CategorizedUsage {
  const { componentName, importEntry } = usage;

  // Rule 1: Lowercase name = HTML native
  const firstName = componentName.split('.')[0]!;
  if (firstName[0] === firstName[0]?.toLowerCase() && firstName[0] !== firstName[0]?.toUpperCase()) {
    return {
      ...usage,
      category: 'html-native',
      dsName: null,
      packageName: null,
      resolvedPath: null,
    };
  }

  // Rule 2: No importEntry = defined in same file = local
  if (!importEntry) {
    return {
      ...usage,
      category: 'local',
      dsName: null,
      packageName: null,
      resolvedPath: null,
    };
  }

  const source = importEntry.source;

  // Resolve the import for further analysis
  const resolved = resolver.resolve(source, usage.filePath);

  // Rule 3: Source matches a design system's packages
  const dsName = findDesignSystem(source, config);
  if (dsName) {
    return {
      ...usage,
      category: 'design-system',
      dsName,
      packageName: resolved.packageName ?? extractPackageName(source),
      resolvedPath: resolved.resolvedPath,
    };
  }

  // Rule 4: Source or resolvedPath matches localLibraryPatterns
  if (matchesLocalLibrary(source, resolved.resolvedPath, config)) {
    const localLib: CategorizedUsage = {
      ...usage,
      category: 'local-library',
      dsName: null,
      packageName: resolved.isNodeModule ? (resolved.packageName ?? null) : null,
      resolvedPath: resolved.resolvedPath,
    };
    return applyTransitiveRule(localLib, config);
  }

  // Rule 5: Non-relative import (node module not matched above) = third-party
  if (!source.startsWith('.') && !source.startsWith('/') && resolved.isNodeModule) {
    const thirdParty: CategorizedUsage = {
      ...usage,
      category: 'third-party',
      dsName: null,
      packageName: resolved.packageName ?? extractPackageName(source),
      resolvedPath: null,
    };
    return applyTransitiveRule(thirdParty, config);
  }

  // Rule 6: Everything else = local
  return {
    ...usage,
    category: 'local',
    dsName: null,
    packageName: null,
    resolvedPath: resolved.resolvedPath,
  };
}

/**
 * Applies declarative transitiveRules from config to local-library and third-party usages.
 * Sets transitiveDS annotation without changing the category.
 * Called synchronously during categorization.
 */
function applyTransitiveRule(
  categorized: CategorizedUsage,
  config: ResolvedConfig
): CategorizedUsage {
  if (!config.transitiveRules || config.transitiveRules.length === 0) return categorized;

  const pkgName = categorized.packageName
    ?? (categorized.importEntry ? extractPackageName(categorized.importEntry.source) : null);

  if (!pkgName) return categorized;

  for (const rule of config.transitiveRules) {
    if (matchesPackage(pkgName, rule.package)) {
      return {
        ...categorized,
        transitiveDS: {
          dsName: rule.backedBy,
          coverage: rule.coverage ?? 1.0,
          source: 'declared',
        },
      };
    }
  }

  return categorized;
}

export function findDesignSystem(source: string, config: ResolvedConfig): string | null {
  for (const ds of config.designSystems) {
    const matches = ds.packages.some(pkg => matchesPackage(source, pkg));
    if (matches) return ds.name;
  }
  return null;
}

function matchesPackage(source: string, pkg: string): boolean {
  // Exact match
  if (source === pkg) return true;

  // Wildcard pattern: "beaver-ui/*" matches "beaver-ui/button"
  if (pkg.endsWith('/*')) {
    const prefix = pkg.slice(0, -2); // Remove "/*"
    return source === prefix || source.startsWith(prefix + '/');
  }

  // Prefix match for subpaths: "beaver-ui" matches "beaver-ui/button"
  if (source.startsWith(pkg + '/')) return true;

  return false;
}

function matchesLocalLibrary(
  source: string,
  resolvedPath: string | null,
  config: ResolvedConfig
): boolean {
  if (config.localLibraryPatterns.length === 0) return false;

  const matchers = config.localLibraryPatterns.map(p =>
    picomatch(p, { dot: true })
  );

  // Check against source specifier
  for (const isMatch of matchers) {
    if (isMatch(source)) return true;
  }

  // Check against resolved path
  if (resolvedPath) {
    const normalizedPath = resolvedPath.replace(/\\/g, '/');
    for (const isMatch of matchers) {
      if (isMatch(normalizedPath)) return true;
      // Also try matching just the relevant portion
      if (isMatch(normalizedPath.replace(/^.*?\/src\//, 'src/'))) return true;
    }
  }

  return false;
}

function extractPackageName(source: string): string {
  if (source.startsWith('@')) {
    return source.split('/').slice(0, 2).join('/');
  }
  return source.split('/')[0]!;
}
