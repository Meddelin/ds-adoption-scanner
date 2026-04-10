// src/metrics/aggregator-v2.ts
// V2 metrics aggregator for cross-repository and cross-route aggregation

import type {
  ScanReportV2,
  RepositoryMetricsV2,
  RouteMetrics,
  BucketBreakdown,
  BucketStats,
  MetricWithDetails,
  DesignSystemMetricsV2,
  LocalComponentProfile,
} from '../domain/types.js';
import type { ClassifiedUsage } from '../domain/types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { REPORT_VERSION, FORMULAS, DENOMINATOR_EXPLANATION } from '../domain/constants.js';

// ─── Cross-Repository Aggregation ─────────────────────────────────────────────

/**
 * Aggregate metrics across multiple repositories.
 */
export function aggregateCrossRepository(
  repoMetrics: RepositoryMetricsV2[],
  allUsages: Map<string, ClassifiedUsage[]>, // repoName -> usages
  allProfiles: Map<string, LocalComponentProfile[]>, // repoName -> profiles
  config: ResolvedConfig,
  scanDurationMs: number,
  filesScanned: number
): ScanReportV2 {
  // Aggregate bucket counts
  const totalAdoptionInstances = repoMetrics.reduce(
    (sum, r) => sum + r.bucketBreakdown.adoption.instances,
    0
  );
  const totalShadowInstances = repoMetrics.reduce(
    (sum, r) => sum + r.bucketBreakdown.shadow.instances,
    0
  );
  const totalNeitherInstances = repoMetrics.reduce(
    (sum, r) => sum + r.bucketBreakdown.neither.instances,
    0
  );

  const denominator = totalAdoptionInstances + totalShadowInstances + totalNeitherInstances;

  // Aggregate unique components
  const allAdoptionComponents = new Set<string>();
  const allShadowComponents = new Set<string>();
  const allNeitherComponents = new Set<string>();

  for (const repo of repoMetrics) {
    for (const comp of repo.bucketBreakdown.adoption.topComponents) {
      allAdoptionComponents.add(comp);
    }
    for (const comp of repo.bucketBreakdown.shadow.topComponents) {
      allShadowComponents.add(comp);
    }
    for (const comp of repo.bucketBreakdown.neither.topComponents) {
      allNeitherComponents.add(comp);
    }
  }

  // Summary metrics
  const directAdoption: MetricWithDetails = {
    percentage: denominator > 0 ? (totalAdoptionInstances / denominator) * 100 : 0,
    instances: totalAdoptionInstances,
    components: allAdoptionComponents.size,
    isProxy: false,
    formula: FORMULAS.directAdoption,
    denominator: {
      instances: denominator,
      components: allAdoptionComponents.size + allShadowComponents.size + allNeitherComponents.size,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  // Effective adoption proxy (weighted)
  const totalEffectiveInstances = repoMetrics.reduce(
    (sum, r) => sum + r.effectiveAdoptionProxy.instances,
    0
  );

  const effectiveAdoptionProxy: MetricWithDetails = {
    percentage: denominator > 0 ? (totalEffectiveInstances / denominator) * 100 : 0,
    instances: totalEffectiveInstances,
    components: repoMetrics.reduce((sum, r) => sum + r.effectiveAdoptionProxy.components, 0),
    isProxy: true,
    formula: FORMULAS.effectiveAdoptionProxy,
    denominator: {
      instances: denominator,
      components: allAdoptionComponents.size + allShadowComponents.size + allNeitherComponents.size,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  // Shadow usage proxy
  const shadowUsageProxy: MetricWithDetails = {
    percentage: denominator > 0 ? (totalShadowInstances / denominator) * 100 : 0,
    instances: totalShadowInstances,
    components: allShadowComponents.size,
    isProxy: true,
    formula: FORMULAS.shadowUsageProxy,
    denominator: {
      instances: denominator,
      components: allAdoptionComponents.size + allShadowComponents.size + allNeitherComponents.size,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  // Bucket breakdown
  const bucketBreakdown: BucketBreakdown = {
    adoption: {
      instances: totalAdoptionInstances,
      components: allAdoptionComponents.size,
      percentage: denominator > 0 ? (totalAdoptionInstances / denominator) * 100 : 0,
      topComponents: [...allAdoptionComponents].slice(0, 10),
    },
    shadow: {
      instances: totalShadowInstances,
      components: allShadowComponents.size,
      percentage: denominator > 0 ? (totalShadowInstances / denominator) * 100 : 0,
      topComponents: [...allShadowComponents].slice(0, 10),
    },
    neither: {
      instances: totalNeitherInstances,
      components: allNeitherComponents.size,
      percentage: denominator > 0 ? (totalNeitherInstances / denominator) * 100 : 0,
      topComponents: [...allNeitherComponents].slice(0, 10),
    },
  };

  // Aggregate per-DS metrics
  const byDesignSystem = aggregatePerDSMetrics(repoMetrics);

  // Aggregate routes if available
  const allRoutes: RouteMetrics[] = [];
  for (const repo of repoMetrics) {
    if (repo.routes) {
      allRoutes.push(...repo.routes);
    }
  }

  // Collect all profiles
  const allProfilesList: LocalComponentProfile[] = [];
  for (const [, profiles] of allProfiles) {
    allProfilesList.push(...profiles);
  }

  // Build component breakdown
  const byComponent = {
    adoption: byDesignSystem.flatMap(ds =>
      ds.topComponents.map(c => ({
        dsName: ds.name,
        componentName: c.name,
        instances: c.instances,
        filesUsedIn: c.filesUsedIn,
      }))
    ),
    shadow: allProfilesList.filter(p => p.analyticalBucket === 'shadow'),
    neither: allProfilesList.filter(p => p.analyticalBucket === 'neither'),
  };

  return {
    version: REPORT_VERSION,
    meta: {
      scannerVersion: '2.0.0',
      timestamp: new Date().toISOString(),
      scanDurationMs,
      configPath: '', // Would come from caller
      filesScanned,
      repositoriesScanned: repoMetrics.length,
      designSystemsConfigured: config.designSystems.map(ds => ds.name),
      routeResolutionEnabled: allRoutes.length > 0,
      shadowDetectionEnabled: true,
      thresholds: {
        reusableFileThreshold: config.reusableThreshold,
        shadowFileThreshold: 2,
        shadowRouteThreshold: 2,
        substantialMarkupThreshold: 5,
      },
    },
    summary: {
      directAdoption,
      effectiveAdoptionProxy,
      shadowUsageProxy,
      bucketBreakdown,
      routeCoverage: calculateRouteCoverage(repoMetrics, filesScanned),
    },
    byDesignSystem,
    byRepository: repoMetrics,
    byRoute: allRoutes.length > 0 ? allRoutes : undefined,
    byComponent,
    localComponentProfiles: allProfilesList,
    classificationConfig: {
      shadowSignalsEnabled: [
        'reusable-local',
        'multi-route',
        'ui-family',
        'substantial-markup',
        'parallel-layer',
        'primitive-like',
      ],
      neitherHeuristicsEnabled: [
        'utility-pattern',
        'data-component',
        'layout-wrapper',
        'thin-wrapper',
        'business-logic',
      ],
      transitiveRulesApplied: config.transitiveRules?.map(r => r.package) ?? [],
    },
  };
}

// ─── Per-DS Aggregation ───────────────────────────────────────────────────────

/**
 * Aggregate per-DS metrics across repositories.
 */
function aggregatePerDSMetrics(repoMetrics: RepositoryMetricsV2[]): DesignSystemMetricsV2[] {
  // Group by DS name
  const byDS = new Map<string, RepositoryMetricsV2['designSystems']>();

  for (const repo of repoMetrics) {
    for (const ds of repo.designSystems) {
      if (!byDS.has(ds.name)) {
        byDS.set(ds.name, []);
      }
      byDS.get(ds.name)!.push(ds);
    }
  }

  // Aggregate each DS
  const result: DesignSystemMetricsV2[] = [];

  for (const [dsName, dsMetrics] of byDS) {
    const totalDirectInstances = dsMetrics.reduce((sum, ds) => sum + ds.directAdoption.instances, 0);
    const totalEffectiveInstances = dsMetrics.reduce(
      (sum, ds) => sum + ds.effectiveAdoptionProxy.instances,
      0
    );
    const totalTransitive = dsMetrics.reduce((sum, ds) => sum + ds.transitiveInstances, 0);

    // Aggregate unique components
    const allComponents = new Map<string, { instances: number; filesUsedIn: number }>();

    for (const ds of dsMetrics) {
      for (const comp of ds.topComponents) {
        const existing = allComponents.get(comp.name);
        if (existing) {
          existing.instances += comp.instances;
          existing.filesUsedIn += comp.filesUsedIn;
        } else {
          allComponents.set(comp.name, {
            instances: comp.instances,
            filesUsedIn: comp.filesUsedIn,
          });
        }
      }
    }

    const topComponents = Array.from(allComponents.entries())
      .sort((a, b) => b[1].instances - a[1].instances)
      .slice(0, 10)
      .map(([name, data]) => ({
        name,
        instances: data.instances,
        filesUsedIn: data.filesUsedIn,
      }));

    // Calculate cross-repo percentages
    const totalDenominator = repoMetrics.reduce(
      (sum, r) =>
        sum +
        r.bucketBreakdown.adoption.instances +
        r.bucketBreakdown.shadow.instances +
        r.bucketBreakdown.neither.instances,
      0
    );

    result.push({
      name: dsName,
      packages: dsMetrics[0]?.packages ?? [],
      directAdoption: {
        percentage: totalDenominator > 0 ? (totalDirectInstances / totalDenominator) * 100 : 0,
        instances: totalDirectInstances,
        components: allComponents.size,
        isProxy: false,
        formula: `Direct ${dsName} / Total Denominator × 100`,
        denominator: {
          instances: totalDenominator,
          components: allComponents.size, // Simplified
          explanation: DENOMINATOR_EXPLANATION,
        },
      },
      effectiveAdoptionProxy: {
        percentage: totalDenominator > 0 ? (totalEffectiveInstances / totalDenominator) * 100 : 0,
        instances: totalEffectiveInstances,
        components: allComponents.size, // Simplified
        isProxy: true,
        formula: `(Direct ${dsName} + Weighted Transitive) / Total Denominator × 100`,
        denominator: {
          instances: totalDenominator,
          components: allComponents.size, // Simplified
          explanation: DENOMINATOR_EXPLANATION,
        },
      },
      instances: totalDirectInstances,
      transitiveInstances: totalTransitive,
      uniqueComponents: allComponents.size,
      topComponents,
    });
  }

  return result;
}

// ─── Route Coverage ───────────────────────────────────────────────────────────

/**
 * Calculate route coverage summary.
 */
function calculateRouteCoverage(
  repoMetrics: RepositoryMetricsV2[],
  totalFiles: number
): {
  totalFiles: number;
  mappedFiles: number;
  unmappedFiles: number;
  coveragePercentage: number;
  byConfidence: { high: number; medium: number; low: number };
  warnings: string[];
} {
  let mappedFiles = 0;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  const warnings: string[] = [];

  for (const repo of repoMetrics) {
    if (repo.routes) {
      for (const route of repo.routes) {
        mappedFiles += route.buckets.adoption.components + route.buckets.shadow.components + route.buckets.neither.components;

        switch (route.confidence) {
          case 'high':
            highConfidence++;
            break;
          case 'medium':
            mediumConfidence++;
            break;
          case 'low':
            lowConfidence++;
            break;
        }
      }
    }
  }

  const unmappedFiles = totalFiles - mappedFiles;
  const coveragePercentage = totalFiles > 0 ? (mappedFiles / totalFiles) * 100 : 0;

  if (unmappedFiles > 0) {
    warnings.push(`${unmappedFiles} files could not be mapped to routes`);
  }

  return {
    totalFiles,
    mappedFiles,
    unmappedFiles,
    coveragePercentage,
    byConfidence: {
      high: highConfidence,
      medium: mediumConfidence,
      low: lowConfidence,
    },
    warnings,
  };
}
