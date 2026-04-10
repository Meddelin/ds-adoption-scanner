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

// --- Cross-Repository Aggregation ---

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
  const allUsagesList = Array.from(allUsages.values()).flat();
  const hasUsageData = allUsagesList.length > 0;

  const countedUsages = hasUsageData ? allUsagesList.filter(isIncludedInDenominator) : [];
  const adoptionUsages = countedUsages.filter(u => u.analyticalBucket === 'adoption');
  const shadowUsages = countedUsages.filter(u => u.analyticalBucket === 'shadow');
  const neitherUsages = countedUsages.filter(u => u.analyticalBucket === 'neither');

  const totalAdoptionInstances = hasUsageData
    ? adoptionUsages.length
    : repoMetrics.reduce((sum, r) => sum + r.bucketBreakdown.adoption.instances, 0);
  const totalShadowInstances = hasUsageData
    ? shadowUsages.length
    : repoMetrics.reduce((sum, r) => sum + r.bucketBreakdown.shadow.instances, 0);
  const totalNeitherInstances = hasUsageData
    ? neitherUsages.length
    : repoMetrics.reduce((sum, r) => sum + r.bucketBreakdown.neither.instances, 0);

  const denominator = totalAdoptionInstances + totalShadowInstances + totalNeitherInstances;

  const directUsages = adoptionUsages.filter(u => u.classificationSource === 'direct-ds');
  const totalDirectInstances = hasUsageData
    ? directUsages.length
    : repoMetrics.reduce((sum, r) => sum + r.directAdoption.instances, 0);

  const weightedTransitive = hasUsageData
    ? adoptionUsages
        .filter(u => u.classificationSource !== 'direct-ds')
        .reduce((sum, u) => sum + (u.transitiveDS?.coverage ?? 0), 0)
    : Math.max(
        0,
        repoMetrics.reduce((sum, r) => sum + r.effectiveAdoptionProxy.instances, 0) -
          totalDirectInstances
      );

  const totalEffectiveInstances = hasUsageData
    ? totalDirectInstances + weightedTransitive
    : repoMetrics.reduce((sum, r) => sum + r.effectiveAdoptionProxy.instances, 0);

  const allAdoptionComponents = hasUsageData
    ? new Set(adoptionUsages.map(getComponentIdentityKey))
    : new Set(repoMetrics.flatMap(r => r.bucketBreakdown.adoption.topComponents));
  const allShadowComponents = hasUsageData
    ? new Set(shadowUsages.map(getComponentIdentityKey))
    : new Set(repoMetrics.flatMap(r => r.bucketBreakdown.shadow.topComponents));
  const allNeitherComponents = hasUsageData
    ? new Set(neitherUsages.map(getComponentIdentityKey))
    : new Set(repoMetrics.flatMap(r => r.bucketBreakdown.neither.topComponents));
  const denominatorComponents = hasUsageData
    ? new Set(countedUsages.map(getComponentIdentityKey)).size
    : allAdoptionComponents.size + allShadowComponents.size + allNeitherComponents.size;
  const effectiveComponents = hasUsageData
    ? new Set(
        adoptionUsages
          .filter(u => u.classificationSource !== 'unclassified')
          .map(getComponentIdentityKey)
      ).size
    : repoMetrics.reduce((sum, r) => sum + r.effectiveAdoptionProxy.components, 0);

  // Summary metrics
  const directAdoption: MetricWithDetails = {
    percentage: denominator > 0 ? (totalDirectInstances / denominator) * 100 : 0,
    instances: totalDirectInstances,
    components: hasUsageData ? new Set(directUsages.map(getComponentIdentityKey)).size : allAdoptionComponents.size,
    isProxy: false,
    formula: FORMULAS.directAdoption,
    denominator: {
      instances: denominator,
      components: denominatorComponents,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  const effectiveAdoptionProxy: MetricWithDetails = {
    percentage: denominator > 0 ? (totalEffectiveInstances / denominator) * 100 : 0,
    instances: totalEffectiveInstances,
    components: effectiveComponents,
    isProxy: true,
    formula: FORMULAS.effectiveAdoptionProxy,
    denominator: {
      instances: denominator,
      components: denominatorComponents,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  const shadowUsageProxy: MetricWithDetails = {
    percentage: denominator > 0 ? (totalShadowInstances / denominator) * 100 : 0,
    instances: totalShadowInstances,
    components: allShadowComponents.size,
    isProxy: true,
    formula: FORMULAS.shadowUsageProxy,
    denominator: {
      instances: denominator,
      components: denominatorComponents,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  // Bucket breakdown
  const bucketBreakdown: BucketBreakdown = {
    adoption: {
      instances: totalAdoptionInstances,
      components: allAdoptionComponents.size,
      percentage: denominator > 0 ? (totalAdoptionInstances / denominator) * 100 : 0,
      topComponents: hasUsageData
        ? getTopComponentNames(adoptionUsages)
        : [...new Set(repoMetrics.flatMap(r => r.bucketBreakdown.adoption.topComponents))].slice(0, 10),
    },
    shadow: {
      instances: totalShadowInstances,
      components: allShadowComponents.size,
      percentage: denominator > 0 ? (totalShadowInstances / denominator) * 100 : 0,
      topComponents: hasUsageData
        ? getTopComponentNames(shadowUsages)
        : [...new Set(repoMetrics.flatMap(r => r.bucketBreakdown.shadow.topComponents))].slice(0, 10),
    },
    neither: {
      instances: totalNeitherInstances,
      components: allNeitherComponents.size,
      percentage: denominator > 0 ? (totalNeitherInstances / denominator) * 100 : 0,
      topComponents: hasUsageData
        ? getTopComponentNames(neitherUsages)
        : [...new Set(repoMetrics.flatMap(r => r.bucketBreakdown.neither.topComponents))].slice(0, 10),
    },
  };

  // Aggregate per-DS metrics
  const byDesignSystem = aggregatePerDSMetrics(
    repoMetrics,
    allUsagesList,
    denominator,
    denominatorComponents
  );

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
      routeCoverage: calculateRouteCoverage(repoMetrics, filesScanned, allUsagesList),
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

// --- Per-DS Aggregation ---

/**
 * Aggregate per-DS metrics across repositories.
 */
function aggregatePerDSMetrics(
  repoMetrics: RepositoryMetricsV2[],
  allUsagesList: ClassifiedUsage[],
  totalDenominator: number,
  totalDenominatorComponents: number
): DesignSystemMetricsV2[] {
  // Group by DS name from repository metrics
  const byDS = new Map<string, RepositoryMetricsV2['designSystems']>();
  for (const repo of repoMetrics) {
    for (const ds of repo.designSystems) {
      if (!byDS.has(ds.name)) {
        byDS.set(ds.name, []);
      }
      byDS.get(ds.name)!.push(ds);
    }
  }

  // Include DS names that appear only in raw usages
  for (const usage of allUsagesList) {
    const name = usage.dsName ?? usage.transitiveDS?.dsName;
    if (name && !byDS.has(name)) {
      byDS.set(name, []);
    }
  }

  const hasUsageData = allUsagesList.length > 0;
  const countedUsages = hasUsageData ? allUsagesList.filter(isIncludedInDenominator) : [];

  // Aggregate each DS
  const result: DesignSystemMetricsV2[] = [];

  for (const [dsName, dsMetrics] of byDS) {
    let totalDirectInstances = 0;
    let totalEffectiveInstances = 0;
    let totalTransitive = 0;
    let directComponents = 0;
    let effectiveComponents = 0;
    let uniqueComponents = 0;
    let topComponents: { name: string; instances: number; filesUsedIn: number }[] = [];

    if (hasUsageData) {
      const directUsages = countedUsages.filter(
        u => u.classificationSource === 'direct-ds' && u.dsName === dsName
      );
      const transitiveUsages = countedUsages.filter(
        u =>
          u.analyticalBucket === 'adoption' &&
          u.classificationSource !== 'direct-ds' &&
          u.transitiveDS?.dsName === dsName
      );

      totalDirectInstances = directUsages.length;
      totalTransitive = transitiveUsages.reduce((sum, u) => sum + (u.transitiveDS?.coverage ?? 0), 0);
      totalEffectiveInstances = totalDirectInstances + totalTransitive;

      directComponents = new Set(directUsages.map(getComponentIdentityKey)).size;
      effectiveComponents = new Set(
        [...directUsages, ...transitiveUsages].map(getComponentIdentityKey)
      ).size;
      uniqueComponents = effectiveComponents;

      const usageByComponent = new Map<string, { instances: number; files: Set<string> }>();
      for (const usage of directUsages) {
        const existing = usageByComponent.get(usage.componentName);
        if (existing) {
          existing.instances++;
          existing.files.add(usage.filePath);
        } else {
          usageByComponent.set(usage.componentName, {
            instances: 1,
            files: new Set([usage.filePath]),
          });
        }
      }

      topComponents = Array.from(usageByComponent.entries())
        .sort((a, b) => b[1].instances - a[1].instances)
        .slice(0, 10)
        .map(([name, data]) => ({
          name,
          instances: data.instances,
          filesUsedIn: data.files.size,
        }));
    } else {
      totalDirectInstances = dsMetrics.reduce((sum, ds) => sum + ds.directAdoption.instances, 0);
      totalEffectiveInstances = dsMetrics.reduce(
        (sum, ds) => sum + ds.effectiveAdoptionProxy.instances,
        0
      );
      totalTransitive = dsMetrics.reduce((sum, ds) => sum + ds.transitiveInstances, 0);

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

      topComponents = Array.from(allComponents.entries())
        .sort((a, b) => b[1].instances - a[1].instances)
        .slice(0, 10)
        .map(([name, data]) => ({
          name,
          instances: data.instances,
          filesUsedIn: data.filesUsedIn,
        }));

      directComponents = allComponents.size;
      effectiveComponents = allComponents.size;
      uniqueComponents = allComponents.size;
    }

    result.push({
      name: dsName,
      packages: dsMetrics[0]?.packages ?? [],
      directAdoption: {
        percentage: totalDenominator > 0 ? (totalDirectInstances / totalDenominator) * 100 : 0,
        instances: totalDirectInstances,
        components: directComponents,
        isProxy: false,
        formula: `Direct ${dsName} / Total Denominator x 100`,
        denominator: {
          instances: totalDenominator,
          components: totalDenominatorComponents,
          explanation: DENOMINATOR_EXPLANATION,
        },
      },
      effectiveAdoptionProxy: {
        percentage:
          totalDenominator > 0 ? (totalEffectiveInstances / totalDenominator) * 100 : 0,
        instances: totalEffectiveInstances,
        components: effectiveComponents,
        isProxy: true,
        formula: `(Direct ${dsName} + Weighted Transitive) / Total Denominator x 100`,
        denominator: {
          instances: totalDenominator,
          components: totalDenominatorComponents,
          explanation: DENOMINATOR_EXPLANATION,
        },
      },
      instances: totalDirectInstances,
      transitiveInstances: totalTransitive,
      uniqueComponents,
      topComponents,
    });
  }

  return result;
}

// --- Route Coverage ---

/**
 * Calculate route coverage summary.
 */
function calculateRouteCoverage(
  repoMetrics: RepositoryMetricsV2[],
  totalFiles: number,
  allUsagesList: ClassifiedUsage[]
): {
  totalFiles: number;
  mappedFiles: number;
  unmappedFiles: number;
  coveragePercentage: number;
  byConfidence: { high: number; medium: number; low: number };
  warnings: string[];
} {
  const warnings: string[] = [];

  if (allUsagesList.length > 0) {
    const confidenceByFile = new Map<string, 'high' | 'medium' | 'low'>();

    for (const usage of allUsagesList) {
      if (!usage.routeId) continue;

      const confidence = usage.routeConfidence ?? 'low';
      const existing = confidenceByFile.get(usage.filePath);
      if (!existing || getConfidenceRank(confidence) > getConfidenceRank(existing)) {
        confidenceByFile.set(usage.filePath, confidence);
      }
    }

    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;
    for (const confidence of confidenceByFile.values()) {
      switch (confidence) {
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

    const mappedFiles = confidenceByFile.size;
    const unmappedFiles = Math.max(0, totalFiles - mappedFiles);
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

  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  for (const repo of repoMetrics) {
    if (!repo.routes) continue;
    for (const route of repo.routes) {
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

  const mappedFiles = 0;
  const unmappedFiles = totalFiles;
  const coveragePercentage = 0;

  if (repoMetrics.some(r => (r.routes?.length ?? 0) > 0)) {
    warnings.push(
      'Route-level metrics are present, but file-level route mapping is unavailable for coverage calculation'
    );
  }
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

function isIncludedInDenominator(usage: ClassifiedUsage): boolean {
  if (usage.category === 'html-native') {
    return false;
  }

  if (usage.category === 'third-party' && usage.analyticalBucket !== 'adoption') {
    return false;
  }

  return (
    usage.analyticalBucket === 'adoption' ||
    usage.analyticalBucket === 'shadow' ||
    usage.analyticalBucket === 'neither'
  );
}

function getComponentIdentityKey(usage: ClassifiedUsage): string {
  if (!usage.resolvedPath) {
    return `${usage.filePath}:${usage.componentName}`;
  }

  const symbol =
    usage.importEntry?.importedName && usage.importEntry.importedName !== '*'
      ? usage.importEntry.importedName
      : usage.componentName;

  return `${usage.resolvedPath}::${symbol}`;
}

function getTopComponentNames(usages: ClassifiedUsage[], limit = 10): string[] {
  const byName = new Map<string, number>();
  for (const usage of usages) {
    byName.set(usage.componentName, (byName.get(usage.componentName) ?? 0) + 1);
  }

  return Array.from(byName.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function getConfidenceRank(confidence: 'high' | 'medium' | 'low'): number {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}

