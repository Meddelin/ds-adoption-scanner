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
import path from 'node:path';

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
  // Filter out repositories that are design-system source repos
  const dsPaths = new Set(
    config.designSystems
      .map(ds => ds.path)
      .filter((p): p is string => !!p)
      .map(p => path.normalize(p))
  );
  const filteredRepoMetrics = repoMetrics.filter(r => {
    const normalized = path.normalize(r.path);
    for (const dsPath of dsPaths) {
      if (normalized === dsPath || normalized.startsWith(dsPath + path.sep)) {
        return false;
      }
    }
    return true;
  });

  const allUsagesList = Array.from(allUsages.values()).flat();
  const hasUsageData = allUsagesList.length > 0;

  // classifiedUsages = all meaningful usages (adoption + shadow + neither); excludes html-native and third-party-neither
  const classifiedUsages = hasUsageData ? allUsagesList.filter(isClassifiedUsage) : [];
  // metricUsages = adoption + shadow only (neither excluded from metric denominator)
  const metricUsages = hasUsageData ? allUsagesList.filter(isInMetricDenominator) : [];

  const adoptionUsages = classifiedUsages.filter(u => u.analyticalBucket === 'adoption');
  const shadowUsages = classifiedUsages.filter(u => u.analyticalBucket === 'shadow');
  const neitherUsages = classifiedUsages.filter(u => u.analyticalBucket === 'neither');

  const totalAdoptionInstances = hasUsageData
    ? adoptionUsages.length
    : filteredRepoMetrics.reduce((sum, r) => sum + r.bucketBreakdown.adoption.instances, 0);
  const totalShadowInstances = hasUsageData
    ? shadowUsages.length
    : filteredRepoMetrics.reduce((sum, r) => sum + r.bucketBreakdown.shadow.instances, 0);
  const totalNeitherInstances = hasUsageData
    ? neitherUsages.length
    : filteredRepoMetrics.reduce((sum, r) => sum + r.bucketBreakdown.neither.instances, 0);

  // metricDenominator: adoption + shadow only (for hero metric percentages)
  const metricDenominator = hasUsageData
    ? metricUsages.length
    : totalAdoptionInstances + totalShadowInstances;
  // totalClassified: all three buckets (for bucket bar percentages)
  const totalClassified = totalAdoptionInstances + totalShadowInstances + totalNeitherInstances;

  const directUsages = adoptionUsages.filter(u => u.classificationSource === 'direct-ds');
  const totalDirectInstances = hasUsageData
    ? directUsages.length
    : filteredRepoMetrics.reduce((sum, r) => sum + r.directAdoption.instances, 0);

  const weightedTransitive = hasUsageData
    ? adoptionUsages
        .filter(u => u.classificationSource !== 'direct-ds')
        .reduce((sum, u) => sum + (u.transitiveDS?.coverage ?? 0), 0)
    : Math.max(
        0,
        filteredRepoMetrics.reduce((sum, r) => sum + r.effectiveAdoptionProxy.instances, 0) -
          totalDirectInstances
      );

  const totalEffectiveInstances = hasUsageData
    ? totalDirectInstances + weightedTransitive
    : filteredRepoMetrics.reduce((sum, r) => sum + r.effectiveAdoptionProxy.instances, 0);

  const allAdoptionComponents = hasUsageData
    ? new Set(adoptionUsages.map(getComponentIdentityKey))
    : new Set(filteredRepoMetrics.flatMap(r => r.bucketBreakdown.adoption.topComponents));
  const allShadowComponents = hasUsageData
    ? new Set(shadowUsages.map(getComponentIdentityKey))
    : new Set(filteredRepoMetrics.flatMap(r => r.bucketBreakdown.shadow.topComponents));
  const allNeitherComponents = hasUsageData
    ? new Set(neitherUsages.map(getComponentIdentityKey))
    : new Set(filteredRepoMetrics.flatMap(r => r.bucketBreakdown.neither.topComponents));
  // metricDenominatorComponents = adoption + shadow only (for metric percentage denominators)
  const metricDenominatorComponents = hasUsageData
    ? new Set(metricUsages.map(getComponentIdentityKey)).size
    : allAdoptionComponents.size + allShadowComponents.size;
  const effectiveComponents = hasUsageData
    ? new Set(
        adoptionUsages
          .filter(u => u.classificationSource !== 'unclassified')
          .map(getComponentIdentityKey)
      ).size
    : filteredRepoMetrics.reduce((sum, r) => sum + r.effectiveAdoptionProxy.components, 0);

  // Summary metrics (use metricDenominator = adoption + shadow, neither excluded)
  const directAdoption: MetricWithDetails = {
    percentage: metricDenominator > 0 ? (totalDirectInstances / metricDenominator) * 100 : 0,
    instances: totalDirectInstances,
    components: hasUsageData ? new Set(directUsages.map(getComponentIdentityKey)).size : allAdoptionComponents.size,
    isProxy: false,
    formula: FORMULAS.directAdoption,
    denominator: {
      instances: metricDenominator,
      components: metricDenominatorComponents,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  const effectiveAdoptionProxy: MetricWithDetails = {
    percentage: metricDenominator > 0 ? (totalEffectiveInstances / metricDenominator) * 100 : 0,
    instances: totalEffectiveInstances,
    components: effectiveComponents,
    isProxy: true,
    formula: FORMULAS.effectiveAdoptionProxy,
    denominator: {
      instances: metricDenominator,
      components: metricDenominatorComponents,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  const shadowUsageProxy: MetricWithDetails = {
    percentage: metricDenominator > 0 ? (totalShadowInstances / metricDenominator) * 100 : 0,
    instances: totalShadowInstances,
    components: allShadowComponents.size,
    isProxy: true,
    formula: FORMULAS.shadowUsageProxy,
    denominator: {
      instances: metricDenominator,
      components: metricDenominatorComponents,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  // Bucket breakdown (percentages use totalClassified = all three buckets, so bars add to 100%)
  const bucketBreakdown: BucketBreakdown = {
    adoption: {
      instances: totalAdoptionInstances,
      components: allAdoptionComponents.size,
      percentage: totalClassified > 0 ? (totalAdoptionInstances / totalClassified) * 100 : 0,
      topComponents: hasUsageData
        ? getTopComponentNames(adoptionUsages)
        : [...new Set(filteredRepoMetrics.flatMap(r => r.bucketBreakdown.adoption.topComponents))].slice(0, 10),
    },
    shadow: {
      instances: totalShadowInstances,
      components: allShadowComponents.size,
      percentage: totalClassified > 0 ? (totalShadowInstances / totalClassified) * 100 : 0,
      topComponents: hasUsageData
        ? getTopComponentNames(shadowUsages)
        : [...new Set(filteredRepoMetrics.flatMap(r => r.bucketBreakdown.shadow.topComponents))].slice(0, 10),
    },
    neither: {
      instances: totalNeitherInstances,
      components: allNeitherComponents.size,
      percentage: totalClassified > 0 ? (totalNeitherInstances / totalClassified) * 100 : 0,
      topComponents: hasUsageData
        ? getTopComponentNames(neitherUsages)
        : [...new Set(filteredRepoMetrics.flatMap(r => r.bucketBreakdown.neither.topComponents))].slice(0, 10),
    },
  };

  // Aggregate per-DS metrics
  const byDesignSystem = aggregatePerDSMetrics(
    filteredRepoMetrics,
    allUsagesList,
    metricDenominator,
    metricDenominatorComponents
  );

  // Aggregate routes if available
  const allRoutes: RouteMetrics[] = [];
  for (const repo of filteredRepoMetrics) {
    if (repo.routes) {
      allRoutes.push(...repo.routes);
    }
  }

  // Collect all profiles, merging same-named components per repo
  const allProfilesList: LocalComponentProfile[] = [];
  for (const [repoPath, profiles] of allProfiles) {
    allProfilesList.push(...mergeProfilesByName(profiles, repoPath));
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
      repositoriesScanned: filteredRepoMetrics.length,
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
      routeCoverage: calculateRouteCoverage(filteredRepoMetrics, filesScanned, allUsagesList),
    },
    byDesignSystem,
    byRepository: filteredRepoMetrics,
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
  const countedUsages = hasUsageData ? allUsagesList.filter(isInMetricDenominator) : [];

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

/** All meaningful usages: adoption + shadow + neither. Excludes html-native and third-party-neither. */
function isClassifiedUsage(usage: ClassifiedUsage): boolean {
  if (usage.category === 'html-native') return false;
  if (usage.category === 'third-party' && usage.analyticalBucket === 'neither') return false;
  return true;
}

/** Metric denominator: adoption + shadow only. Neither excluded from metric percentages. */
function isInMetricDenominator(usage: ClassifiedUsage): boolean {
  if (!isClassifiedUsage(usage)) return false;
  return usage.analyticalBucket === 'adoption' || usage.analyticalBucket === 'shadow';
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

/**
 * Merge profiles with the same componentName within a repository.
 * Copy-pasted components (same name, different paths) represent the same shadow pattern
 * and should appear as a single entry with aggregated counts.
 */
function mergeProfilesByName(
  profiles: LocalComponentProfile[],
  repoPath: string
): LocalComponentProfile[] {
  const byName = new Map<string, LocalComponentProfile[]>();
  for (const p of profiles) {
    const key = p.componentName;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(p);
  }

  const result: LocalComponentProfile[] = [];
  for (const [, group] of byName) {
    if (group.length === 1) {
      result.push(group[0]!);
      continue;
    }

    // Merge: pick representative profile (highest fileCount), accumulate counts
    const representative = [...group].sort((a, b) => b.fileCount - a.fileCount)[0]!;
    const totalFileCount = group.reduce((s, p) => s + p.fileCount, 0);
    const totalRouteCount = Math.max(...group.map(p => p.routeCount));

    // Merge signals: keep unique by type, prefer strongest strength
    const signalMap = new Map<string, (typeof representative.signals)[0]>();
    for (const p of group) {
      for (const sig of p.signals) {
        const existing = signalMap.get(sig.type);
        const rank = (s: string) => s === 'strong' ? 3 : s === 'moderate' ? 2 : 1;
        if (!existing || rank(sig.strength) > rank(existing.strength)) {
          signalMap.set(sig.type, sig);
        }
      }
    }

    const copyNote = group.length > 1
      ? ` (${group.length} copies in ${repoPath.split(/[\\/]/).pop()})`
      : '';

    result.push({
      ...representative,
      fileCount: totalFileCount,
      routeCount: totalRouteCount,
      signals: [...signalMap.values()],
      // Tag the evidence on the primary signal to show it's a copy-paste pattern
      ...(representative.signals[0] ? {
        signals: [...signalMap.values()].map(s => ({
          ...s,
          evidence: s === [...signalMap.values()][0]
            ? s.evidence + copyNote
            : s.evidence,
        })),
      } : {}),
    });
  }

  return result;
}

