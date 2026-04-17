import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@typescript-eslint/typescript-estree';
import type {
  ClassifiedUsage,
  LocalComponentProfile,
  RepositoryMetricsV2,
  ScanReportV2,
} from '../domain/types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { executeScanPipeline, type ScanOptions } from './pipeline.js';
import { AnalyticalClassifier, createClassificationContext } from '../classification/classifier.js';
import { RouteResolutionOrchestrator } from '../routes/resolver.js';
import { calculateRepositoryMetricsV2, calculateRouteMetrics } from '../metrics/calculator-v2.js';
import { aggregateCrossRepository } from '../metrics/aggregator-v2.js';
import { checkReportInvariants } from '../domain/invariants.js';

type RouteConfidence = 'high' | 'medium' | 'low';

interface RouteAttribution {
  fileRoutes: Map<string, string[]>;
  confidenceByFile: Map<string, Map<string, RouteConfidence>>;
  primaryRouteByFile: Map<string, string>;
  primaryConfidenceByFile: Map<string, RouteConfidence>;
  /** Maps routeId → resolver name ('react-router', 'nextjs-pages', etc.) */
  sourceByRouteId: Map<string, string>;
}

export async function runScanV2(
  config: ResolvedConfig,
  options: ScanOptions
): Promise<ScanReportV2> {
  const startedAt = Date.now();
  const { repoData, filesScanned } = await executeScanPipeline(config, options);

  const repoMetrics: RepositoryMetricsV2[] = [];
  const allUsages = new Map<string, ClassifiedUsage[]>();
  const allProfiles = new Map<string, LocalComponentProfile[]>();

  for (const repo of repoData) {
    const routeAttribution = config.v2.routeResolution.enabled
      ? await resolveRoutesWithImportGraph(repo.repositoryPath, repo.usages, config)
      : emptyRouteAttribution();

    const classifier = new AnalyticalClassifier(
      createClassificationContext(
        repo.repositoryPath,
        config.designSystems.map(ds => ({ name: ds.name, packages: ds.packages })),
        {
          routeMapping: createClassifierRouteMapping(routeAttribution.fileRoutes),
          thresholds: config.v2.classification.thresholds,
          features: {
            shadowDetection: config.v2.classification.shadowDetection,
            neitherDetection: config.v2.classification.neitherDetection,
          },
          thirdPartyWithoutDSBucket: config.v2.classification.thirdPartyWithoutDSBucket,
        }
      )
    );

    const classification = classifier.classify(repo.usages);
    const classifiedWithPrimaryRoute = attachPrimaryRoutes(
      classification.usages,
      routeAttribution.primaryRouteByFile,
      routeAttribution.primaryConfidenceByFile
    );

    const expandedForRouteMetrics = expandUsagesByRoute(
      classifiedWithPrimaryRoute,
      routeAttribution.fileRoutes,
      routeAttribution.confidenceByFile
    );

    const routeMetrics =
      config.v2.routeResolution.enabled && routeAttribution.fileRoutes.size > 0
        ? calculateRouteMetrics(expandedForRouteMetrics, undefined, routeAttribution.sourceByRouteId)
        : undefined;

    const repoMetric = calculateRepositoryMetricsV2(
      repo.repositoryName,
      repo.repositoryPath,
      classifiedWithPrimaryRoute,
      classification.profiles,
      config,
      repo.filesScanned,
      routeMetrics
    );

    repoMetrics.push(repoMetric);
    allUsages.set(repo.repositoryPath, classifiedWithPrimaryRoute);
    allProfiles.set(repo.repositoryPath, classification.profiles);
  }

  const scanDurationMs = Date.now() - startedAt;
  const report = aggregateCrossRepository(
    repoMetrics,
    allUsages,
    allProfiles,
    config,
    scanDurationMs,
    filesScanned
  );

  report.meta.timestamp = new Date().toISOString();
  report.meta.configPath = options.configPath;

  if (config.v2.invariants.enabled) {
    const invariants = checkReportInvariants(report);
    report.invariants = invariants;
    if (!invariants.allPassed) {
      report.summary.routeCoverage.warnings.push(
        `Invariant checks failed: ${invariants.checks.filter(c => !c.passed).map(c => c.name).join(', ')}`
      );
      if (config.v2.invariants.failOnViolation) {
        throw new Error('V2 invariant checks failed');
      }
    }
  }

  return report;
}

function emptyRouteAttribution(): RouteAttribution {
  return {
    fileRoutes: new Map(),
    confidenceByFile: new Map(),
    primaryRouteByFile: new Map(),
    primaryConfidenceByFile: new Map(),
    sourceByRouteId: new Map(),
  };
}

async function resolveRoutesWithImportGraph(
  repoPath: string,
  usages: { filePath: string; resolvedPath: string | null }[],
  config: ResolvedConfig
): Promise<RouteAttribution> {
  const resolver = new RouteResolutionOrchestrator({
    enabled: config.v2.routeResolution.enabled,
    preferredResolver: config.v2.routeResolution.preferredResolver,
    enableFallback: config.v2.routeResolution.enableFallback,
    fallbackBoundaryDirs: config.v2.routeResolution.fallbackBoundaryDirs,
  });

  const initialized = await resolver.initialize(repoPath);
  if (!initialized) {
    return emptyRouteAttribution();
  }

  const uniqueFiles = [...new Set(usages.map(u => u.filePath))];
  const routeResults = await resolver.resolveFiles(uniqueFiles);

  const confidenceByFile = new Map<string, Map<string, RouteConfidence>>();
  const sourceByRouteId = new Map<string, string>();
  for (const result of routeResults) {
    if (!result.routeMatch) continue;
    setRouteConfidence(
      confidenceByFile,
      normalizeFsPath(result.filePath),
      result.routeMatch.routeId,
      result.routeMatch.confidence
    );
    // Track which resolver found this route (first write wins — primary resolver)
    if (!sourceByRouteId.has(result.routeMatch.routeId)) {
      sourceByRouteId.set(result.routeMatch.routeId, result.routeMatch.source);
    }
  }

  const adjacency = buildDependencyGraph(usages, repoPath);
  propagateRoutes(confidenceByFile, adjacency);

  const fileRoutes = new Map<string, string[]>();
  const primaryRouteByFile = new Map<string, string>();
  const primaryConfidenceByFile = new Map<string, RouteConfidence>();

  for (const [filePath, routeConf] of confidenceByFile) {
    const routes = [...routeConf.keys()].sort();
    fileRoutes.set(filePath, routes);
    const primaryRoute = selectPrimaryRoute(routeConf);
    if (primaryRoute) {
      primaryRouteByFile.set(filePath, primaryRoute.routeId);
      primaryConfidenceByFile.set(filePath, primaryRoute.confidence);
    }
  }

  return {
    fileRoutes,
    confidenceByFile,
    primaryRouteByFile,
    primaryConfidenceByFile,
    sourceByRouteId,
  };
}

const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js'];

/**
 * Resolve a relative import specifier to an absolute file path, trying common
 * extensions. Returns null if nothing on disk matches.
 */
function resolveRelativeImport(specifier: string, fromDir: string): string | null {
  // Already has an extension
  const direct = path.resolve(fromDir, specifier);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = direct + ext;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Extract all static import specifiers from a source file via AST.
 * Silently ignores parse errors (returns empty array).
 */
function extractImportSpecifiers(filePath: string): string[] {
  let code: string;
  try {
    code = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  try {
    const ast = parse(code, {
      jsx: true,
      loc: false,
      range: false,
      tokens: false,
      comment: false,
      errorOnUnknownASTType: false,
    });

    const specifiers: string[] = [];
    for (const node of ast.body) {
      if (
        node.type === 'ImportDeclaration' &&
        typeof node.source.value === 'string'
      ) {
        specifiers.push(node.source.value);
      }
      // export { x } from '...'
      if (
        (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
        node.source &&
        typeof node.source.value === 'string'
      ) {
        specifiers.push(node.source.value);
      }
    }
    return specifiers;
  } catch {
    return [];
  }
}

function buildDependencyGraph(
  usages: { filePath: string; resolvedPath: string | null }[],
  repoPath: string
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const normalizedRepo = normalizeFsPath(repoPath);

  // Pass 1: edges from JSX usage resolution (existing behaviour)
  for (const usage of usages) {
    if (!usage.resolvedPath) continue;

    const importer = normalizeFsPath(usage.filePath);
    const imported = normalizeFsPath(usage.resolvedPath);
    if (!imported.startsWith(normalizedRepo)) continue;

    if (!graph.has(importer)) graph.set(importer, new Set());
    graph.get(importer)!.add(imported);
  }

  // Pass 2: edges from all static import/export-from statements in each file.
  // This ensures route labels propagate through non-JSX import chains
  // (e.g. route-file → data-fetcher → shared UI component).
  const uniqueFiles = new Set(usages.map(u => normalizeFsPath(u.filePath)));
  for (const file of uniqueFiles) {
    const dir = path.dirname(file);
    const specifiers = extractImportSpecifiers(file);

    for (const spec of specifiers) {
      // Only resolve relative imports (aliases would need a TS resolver)
      if (!spec.startsWith('.')) continue;

      const resolved = resolveRelativeImport(spec, dir);
      if (!resolved) continue;

      const normalizedResolved = normalizeFsPath(resolved);
      if (!normalizedResolved.startsWith(normalizedRepo)) continue;

      if (!graph.has(file)) graph.set(file, new Set());
      graph.get(file)!.add(normalizedResolved);
    }
  }

  return graph;
}

function propagateRoutes(
  confidenceByFile: Map<string, Map<string, RouteConfidence>>,
  graph: Map<string, Set<string>>
): void {
  const queue = [...confidenceByFile.keys()];

  while (queue.length > 0) {
    const file = queue.shift()!;
    const currentRoutes = confidenceByFile.get(file);
    if (!currentRoutes) continue;

    const deps = graph.get(file);
    if (!deps || deps.size === 0) continue;

    for (const dep of deps) {
      let changed = false;
      for (const [routeId, confidence] of currentRoutes) {
        const propagated = downgradeConfidence(confidence);
        changed = setRouteConfidence(confidenceByFile, dep, routeId, propagated) || changed;
      }
      if (changed) {
        queue.push(dep);
      }
    }
  }
}

function createClassifierRouteMapping(
  fileRoutes: Map<string, string[]>
): Map<string, string | string[]> {
  const map = new Map<string, string | string[]>();
  for (const [file, routes] of fileRoutes) {
    if (routes.length === 1) {
      map.set(file, routes[0]!);
    } else if (routes.length > 1) {
      map.set(file, routes);
    }
  }
  return map;
}

function attachPrimaryRoutes(
  usages: ClassifiedUsage[],
  primaryRouteByFile: Map<string, string>,
  primaryConfidenceByFile: Map<string, RouteConfidence>
): ClassifiedUsage[] {
  return usages.map(usage => {
    const file = normalizeFsPath(usage.filePath);
    const routeId = primaryRouteByFile.get(file);
    if (!routeId) return usage;

    return {
      ...usage,
      routeId,
      routeConfidence: primaryConfidenceByFile.get(file) ?? 'low',
    };
  });
}

function expandUsagesByRoute(
  usages: ClassifiedUsage[],
  fileRoutes: Map<string, string[]>,
  confidenceByFile: Map<string, Map<string, RouteConfidence>>
): ClassifiedUsage[] {
  const expanded: ClassifiedUsage[] = [];

  for (const usage of usages) {
    const file = normalizeFsPath(usage.filePath);
    const routes = fileRoutes.get(file);
    if (!routes || routes.length === 0) {
      expanded.push(usage);
      continue;
    }

    const confMap = confidenceByFile.get(file);
    for (const routeId of routes) {
      expanded.push({
        ...usage,
        routeId,
        routeConfidence: confMap?.get(routeId) ?? usage.routeConfidence ?? 'low',
      });
    }
  }

  return expanded;
}

function setRouteConfidence(
  map: Map<string, Map<string, RouteConfidence>>,
  filePath: string,
  routeId: string,
  confidence: RouteConfidence
): boolean {
  if (!map.has(filePath)) {
    map.set(filePath, new Map());
  }

  const routeMap = map.get(filePath)!;
  const existing = routeMap.get(routeId);
  if (!existing || confidenceRank(confidence) > confidenceRank(existing)) {
    routeMap.set(routeId, confidence);
    return true;
  }

  return false;
}

function selectPrimaryRoute(
  routeConf: Map<string, RouteConfidence>
): { routeId: string; confidence: RouteConfidence } | null {
  if (routeConf.size === 0) return null;

  const sorted = [...routeConf.entries()].sort((a, b) => {
    const diff = confidenceRank(b[1]) - confidenceRank(a[1]);
    if (diff !== 0) return diff;
    return a[0].localeCompare(b[0]);
  });

  const [routeId, confidence] = sorted[0]!;
  return { routeId, confidence };
}

function downgradeConfidence(confidence: RouteConfidence): RouteConfidence {
  if (confidence === 'high') return 'medium';
  if (confidence === 'medium') return 'low';
  return 'low';
}

function confidenceRank(confidence: RouteConfidence): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

function normalizeFsPath(filePath: string): string {
  return path.normalize(filePath);
}
