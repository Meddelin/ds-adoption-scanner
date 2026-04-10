// src/metrics/calculator-v2.ts
// V2 metric calculator with deterministic analytical model

import type {
  ClassifiedUsage,
  LocalComponentProfile,
  MetricWithDetails,
  BucketBreakdown,
  BucketStats,
  DesignSystemMetricsV2,
  RepositoryMetricsV2,
  RouteMetrics,
} from '../domain/types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { FORMULAS, DENOMINATOR_EXPLANATION } from '../domain/constants.js';

// --- Types for Calculation ---

interface CalculationContext {
  config: ResolvedConfig;
  repoPath: string;
  filesScanned: number;
  routeMapping?: Map<string, string>; // filePath -> routeId
}

// --- Main Metric Calculation ---

/**
 * Calculate V2 metrics from classified usages.
 */
export function calculateMetricsV2(
  usages: ClassifiedUsage[],
  profiles: LocalComponentProfile[],
  context: CalculationContext
): {
  directAdoption: MetricWithDetails;
  effectiveAdoptionProxy: MetricWithDetails;
  shadowUsageProxy: MetricWithDetails;
  bucketBreakdown: BucketBreakdown;
} {
  // Metric denominator: Adoption + Shadow only (Neither excluded)
  const metricDenom = calculateMetricDenominator(usages);

  // Total classified: Adoption + Shadow + Neither (for bucket bar visualization)
  const totalClassified = calculateTotalClassified(usages);

  // Calculate bucket counts (uses total classified)
  const bucketCounts = calculateBucketCounts(usages, profiles);

  // Direct adoption: only direct DS usages
  const directUsages = usages.filter(
    u =>
      isInMetricDenominator(u) &&
      u.analyticalBucket === 'adoption' &&
      u.classificationSource === 'direct-ds'
  );
  const directDSInstances = directUsages.length;

  const directAdoption: MetricWithDetails = {
    percentage: metricDenom.instances > 0 ? (directDSInstances / metricDenom.instances) * 100 : 0,
    instances: directDSInstances,
    components: countUniqueComponents(directUsages),
    isProxy: false,
    formula: FORMULAS.directAdoption,
    denominator: {
      instances: metricDenom.instances,
      components: metricDenom.components,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  // Effective adoption proxy: DS + weighted transitive
  const transitiveUsages = usages.filter(
    u =>
      isInMetricDenominator(u) &&
      u.analyticalBucket === 'adoption' &&
      (u.classificationSource === 'transitive-declared' ||
        u.classificationSource === 'transitive-auto' ||
        u.classificationSource === 'ds-backed-wrapper')
  );

  const weightedTransitive = transitiveUsages.reduce((sum, u) => {
    return sum + (u.transitiveDS?.coverage ?? 0);
  }, 0);

  const effectiveInstances = directDSInstances + weightedTransitive;

  const effectiveAdoptionProxy: MetricWithDetails = {
    percentage: metricDenom.instances > 0 ? (effectiveInstances / metricDenom.instances) * 100 : 0,
    instances: effectiveInstances,
    components: countUniqueComponents(
      usages.filter(
        u =>
          isInMetricDenominator(u) &&
          u.analyticalBucket === 'adoption' &&
          u.classificationSource !== 'unclassified'
      )
    ),
    isProxy: true,
    formula: FORMULAS.effectiveAdoptionProxy,
    denominator: {
      instances: metricDenom.instances,
      components: metricDenom.components,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  // Shadow usage proxy
  const shadowInstances = bucketCounts.shadow.instances;

  const shadowUsageProxy: MetricWithDetails = {
    percentage: metricDenom.instances > 0 ? (shadowInstances / metricDenom.instances) * 100 : 0,
    instances: shadowInstances,
    components: bucketCounts.shadow.components,
    isProxy: true,
    formula: FORMULAS.shadowUsageProxy,
    denominator: {
      instances: metricDenom.instances,
      components: metricDenom.components,
      explanation: DENOMINATOR_EXPLANATION,
    },
  };

  // Bucket breakdown — percentages relative to total classified (for stacked bar)
  const bucketBreakdown: BucketBreakdown = {
    adoption: calculateBucketStats(usages, profiles, 'adoption', totalClassified.instances),
    shadow: calculateBucketStats(usages, profiles, 'shadow', totalClassified.instances),
    neither: calculateBucketStats(usages, profiles, 'neither', totalClassified.instances),
  };

  return {
    directAdoption,
    effectiveAdoptionProxy,
    shadowUsageProxy,
    bucketBreakdown,
  };
}

// --- Denominator Calculation ---

/**
 * Metric denominator: Adoption + Shadow only.
 * Neither is excluded so utility/business wrappers don't dilute adoption %.
 */
function calculateMetricDenominator(usages: ClassifiedUsage[]): {
  instances: number;
  components: number;
} {
  const relevant = usages.filter(isInMetricDenominator);
  return { instances: relevant.length, components: countUniqueComponents(relevant) };
}

/**
 * Total classified: Adoption + Shadow + Neither.
 * Used for bucket bar visualization (stacked bar adds to 100%).
 */
function calculateTotalClassified(usages: ClassifiedUsage[]): {
  instances: number;
  components: number;
} {
  const relevant = usages.filter(isClassifiedUsage);
  return { instances: relevant.length, components: countUniqueComponents(relevant) };
}

// --- Bucket Counts ---

interface BucketCounts {
  adoption: { instances: number; components: number };
  shadow: { instances: number; components: number };
  neither: { instances: number; components: number };
}

/**
 * Calculate counts per bucket (uses total classified — includes neither).
 */
function calculateBucketCounts(
  usages: ClassifiedUsage[],
  profiles: LocalComponentProfile[]
): BucketCounts {
  const relevantUsages = usages.filter(isClassifiedUsage);

  const byBucket = {
    adoption: [] as ClassifiedUsage[],
    shadow: [] as ClassifiedUsage[],
    neither: [] as ClassifiedUsage[],
  };

  for (const usage of relevantUsages) {
    if (usage.analyticalBucket in byBucket) {
      byBucket[usage.analyticalBucket].push(usage);
    }
  }

  return {
    adoption: {
      instances: byBucket.adoption.length,
      components: countUniqueComponents(byBucket.adoption),
    },
    shadow: {
      instances: byBucket.shadow.length,
      components: countUniqueComponents(byBucket.shadow),
    },
    neither: {
      instances: byBucket.neither.length,
      components: countUniqueComponents(byBucket.neither),
    },
  };
}

// --- Bucket Stats ---

/**
 * Calculate detailed stats for a bucket.
 */
function calculateBucketStats(
  usages: ClassifiedUsage[],
  profiles: LocalComponentProfile[],
  bucket: 'adoption' | 'shadow' | 'neither',
  totalInstances: number
): BucketStats {
  // totalInstances = total classified (adoption+shadow+neither) — for stacked bar %
  const bucketUsages = usages.filter(
    u => isClassifiedUsage(u) && u.analyticalBucket === bucket
  );
  const instances = bucketUsages.length;

  // Get unique components
  const componentSet = new Set<string>();
  for (const usage of bucketUsages) {
    componentSet.add(getComponentIdentityKey(usage));
  }
  const components = componentSet.size;

  // Top components by usage
  const usageByComponent = new Map<string, number>();
  for (const usage of bucketUsages) {
    const key = usage.componentName;
    usageByComponent.set(key, (usageByComponent.get(key) ?? 0) + 1);
  }

  const topComponents = Array.from(usageByComponent.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);

  return {
    instances,
    components,
    percentage: totalInstances > 0 ? (instances / totalInstances) * 100 : 0,
    topComponents,
  };
}

// --- Utility Functions ---

/**
 * Count unique components from usages.
 */
function countUniqueComponents(usages: ClassifiedUsage[]): number {
  const unique = new Set<string>();
  for (const usage of usages) {
    unique.add(getComponentIdentityKey(usage));
  }
  return unique.size;
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

// --- Per-DS Metrics ---

/**
 * Calculate per-DS metrics for V2.
 */
export function calculatePerDSMetricsV2(
  usages: ClassifiedUsage[],
  config: ResolvedConfig
): DesignSystemMetricsV2[] {
  const metricDenomUsages = usages.filter(isInMetricDenominator);
  const denominatorInstances = metricDenomUsages.length;
  const denominatorComponents = countUniqueComponents(metricDenomUsages);

  return config.designSystems.map(ds => {
    // Direct DS usages
    const directUsages = usages.filter(
      u =>
        isInMetricDenominator(u) &&
        u.dsName === ds.name &&
        u.classificationSource === 'direct-ds'
    );

    // Transitive usages for this DS
    const transitiveUsages = usages.filter(
      u =>
        isInMetricDenominator(u) &&
        u.transitiveDS?.dsName === ds.name &&
        u.analyticalBucket === 'adoption'
    );

    const weightedTransitive = transitiveUsages.reduce(
      (sum, u) => sum + (u.transitiveDS?.coverage ?? 0),
      0
    );

    const directInstances = directUsages.length;
    const effectiveInstances = directInstances + weightedTransitive;

    const directAdoption: MetricWithDetails = {
      percentage:
        denominatorInstances > 0 ? (directInstances / denominatorInstances) * 100 : 0,
      instances: directInstances,
      components: countUniqueComponents(directUsages),
      isProxy: false,
      formula: `Direct ${ds.name} / Denominator x 100`,
      denominator: {
        instances: denominatorInstances,
        components: denominatorComponents,
        explanation: DENOMINATOR_EXPLANATION,
      },
    };

    const effectiveAdoptionProxy: MetricWithDetails = {
      percentage:
        denominatorInstances > 0 ? (effectiveInstances / denominatorInstances) * 100 : 0,
      instances: effectiveInstances,
      components: countUniqueComponents([...directUsages, ...transitiveUsages]),
      isProxy: true,
      formula: `(Direct ${ds.name} + Weighted Transitive) / Denominator x 100`,
      denominator: {
        instances: denominatorInstances,
        components: denominatorComponents,
        explanation: DENOMINATOR_EXPLANATION,
      },
    };

    // Top components
    const usageByComponent = new Map<string, number>();
    const filesByComponent = new Map<string, Set<string>>();

    for (const usage of directUsages) {
      const name = usage.componentName;
      usageByComponent.set(name, (usageByComponent.get(name) ?? 0) + 1);

      if (!filesByComponent.has(name)) {
        filesByComponent.set(name, new Set());
      }
      filesByComponent.get(name)!.add(usage.filePath);
    }

    const topComponents = Array.from(usageByComponent.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, instances]) => ({
        name,
        instances,
        filesUsedIn: filesByComponent.get(name)?.size ?? 0,
      }));

    return {
      name: ds.name,
      packages: ds.packages,
      directAdoption,
      effectiveAdoptionProxy,
      instances: directInstances,
      transitiveInstances: weightedTransitive,
      uniqueComponents: countUniqueComponents(directUsages),
      topComponents,
    };
  });
}

// --- Route-Level Metrics ---

/**
 * Calculate route-level metrics.
 */
export function calculateRouteMetrics(
  usages: ClassifiedUsage[],
  routeMapping?: Map<string, string>,
  sourceByRouteId?: Map<string, string>
): RouteMetrics[] {
  // Group usages by route
  const byRoute = new Map<string, ClassifiedUsage[]>();

  for (const usage of usages) {
    const routeId = usage.routeId ?? routeMapping?.get(usage.filePath);
    if (!routeId) continue;

    const existing = byRoute.get(routeId);
    if (existing) {
      existing.push(usage);
    } else {
      byRoute.set(routeId, [usage]);
    }
  }

  // Calculate metrics per route
  const routeMetrics: RouteMetrics[] = [];

  for (const [routeId, routeUsages] of byRoute) {
    const countedUsages = routeUsages.filter(isClassifiedUsage);
    const adoptionUsages = countedUsages.filter(u => u.analyticalBucket === 'adoption');
    const shadowUsages = countedUsages.filter(u => u.analyticalBucket === 'shadow');
    const neitherUsages = countedUsages.filter(u => u.analyticalBucket === 'neither');
    // Metric denominator excludes neither
    const denominator = adoptionUsages.length + shadowUsages.length;

    // Direct adoption (only direct DS)
    const directUsages = adoptionUsages.filter(u => u.classificationSource === 'direct-ds');
    const directInstances = directUsages.length;

    // Effective adoption (DS + transitive)
    const transitiveInstances = adoptionUsages
      .filter(u => u.classificationSource !== 'direct-ds')
      .reduce((sum, u) => sum + (u.transitiveDS?.coverage ?? 0), 0);
    const effectiveInstances = directInstances + transitiveInstances;

    // Shadow instances
    const shadowInstances = shadowUsages.length;

    const routeConfidence = getRouteConfidence(routeUsages);

    const routeSource = sourceByRouteId?.get(routeId) as RouteMetrics['resolver'] | undefined;

    routeMetrics.push({
      routeId,
      routeKey: routeId,
      confidence: routeConfidence,
      resolver: routeSource,
      buckets: {
        adoption: {
          instances: adoptionUsages.length,
          components: countUniqueComponents(adoptionUsages),
        },
        shadow: {
          instances: shadowUsages.length,
          components: countUniqueComponents(shadowUsages),
        },
        neither: {
          instances: neitherUsages.length,
          components: countUniqueComponents(neitherUsages),
        },
      },
      directAdoption: {
        percentage: denominator > 0 ? (directInstances / denominator) * 100 : 0,
        instances: directInstances,
        components: countUniqueComponents(directUsages),
        isProxy: false,
        formula: FORMULAS.directAdoption,
        denominator: {
          instances: denominator,
          components: countUniqueComponents(countedUsages),
          explanation: DENOMINATOR_EXPLANATION,
        },
      },
      effectiveAdoptionProxy: {
        percentage: denominator > 0 ? (effectiveInstances / denominator) * 100 : 0,
        instances: effectiveInstances,
        components: countUniqueComponents(adoptionUsages),
        isProxy: true,
        formula: FORMULAS.effectiveAdoptionProxy,
        denominator: {
          instances: denominator,
          components: countUniqueComponents(countedUsages),
          explanation: DENOMINATOR_EXPLANATION,
        },
      },
      shadowUsageProxy: {
        percentage: denominator > 0 ? (shadowInstances / denominator) * 100 : 0,
        instances: shadowInstances,
        components: countUniqueComponents(shadowUsages),
        isProxy: true,
        formula: FORMULAS.shadowUsageProxy,
        denominator: {
          instances: denominator,
          components: countUniqueComponents(countedUsages),
          explanation: DENOMINATOR_EXPLANATION,
        },
      },
      components: {
        adoption: [...new Set(adoptionUsages.map(u => u.componentName))],
        shadow: [...new Set(shadowUsages.map(u => u.componentName))],
        neither: [...new Set(neitherUsages.map(u => u.componentName))],
      },
    });
  }

  return routeMetrics.sort((a, b) => a.routeId.localeCompare(b.routeId));
}

/**
 * Returns true for every usage that is part of the classified UI layer.
 * Used for: bucket bar visualization, total component counts.
 * Excludes: HTML native elements, third-party classified as neither.
 */
function isClassifiedUsage(usage: ClassifiedUsage): boolean {
  if (usage.category === 'html-native') return false;
  if (usage.category === 'third-party' && usage.analyticalBucket === 'neither') return false;
  return true;
}

/**
 * Returns true for usages that belong in the adoption/shadow metric denominator.
 * Neither is intentionally excluded — it is a service layer (providers, data
 * fetchers, business wrappers) that should not influence adoption or shadow %.
 *
 * Adoption % = DS / (Adoption + Shadow) × 100
 * Shadow %   = Shadow / (Adoption + Shadow) × 100
 */
function isInMetricDenominator(usage: ClassifiedUsage): boolean {
  if (!isClassifiedUsage(usage)) return false;
  return usage.analyticalBucket === 'adoption' || usage.analyticalBucket === 'shadow';
}

function getRouteConfidence(usages: ClassifiedUsage[]): 'high' | 'medium' | 'low' {
  let rank = 1;
  for (const usage of usages) {
    const confidence = usage.routeConfidence ?? 'low';
    if (confidence === 'high') {
      rank = Math.max(rank, 3);
    } else if (confidence === 'medium') {
      rank = Math.max(rank, 2);
    }
  }

  if (rank === 3) return 'high';
  if (rank === 2) return 'medium';
  return 'low';
}

// --- Repository Metrics ---

/**
 * Calculate repository-level metrics for V2.
 */
export function calculateRepositoryMetricsV2(
  repoName: string,
  repoPath: string,
  usages: ClassifiedUsage[],
  profiles: LocalComponentProfile[],
  config: ResolvedConfig,
  filesScanned: number,
  routeMetrics?: RouteMetrics[]
): RepositoryMetricsV2 {
  const context: CalculationContext = {
    config,
    repoPath,
    filesScanned,
  };

  const { directAdoption, effectiveAdoptionProxy, shadowUsageProxy, bucketBreakdown } =
    calculateMetricsV2(usages, profiles, context);

  const dsMetrics = calculatePerDSMetricsV2(usages, config);

  return {
    name: repoName,
    path: repoPath,
    filesScanned,
    directAdoption,
    effectiveAdoptionProxy,
    shadowUsageProxy,
    bucketBreakdown,
    designSystems: dsMetrics,
    routes: routeMetrics,
  };
}

