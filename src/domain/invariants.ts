// src/domain/invariants.ts
// Invariant checks for analytical model correctness

import type {
  ScanReportV2,
  ClassifiedUsage,
  InvariantCheck,
  InvariantReport,
  AnalyticalBucket,
} from './types.js';

// ─── Individual Invariant Checks ──────────────────────────────────────────────

/**
 * Check that all usages have exactly one analytical bucket assigned.
 */
export function checkBucketExclusivity(usages: ClassifiedUsage[]): InvariantCheck {
  const unclassified = usages.filter(
    u => !u.analyticalBucket || u.analyticalBucket === 'unclassified'
  );

  const invalid = usages.filter(
    u => u.analyticalBucket && !['adoption', 'shadow', 'neither'].includes(u.analyticalBucket)
  );

  const passed = unclassified.length === 0 && invalid.length === 0;

  return {
    name: 'bucket-exclusivity',
    passed,
    message: passed
      ? `All ${usages.length} usages have valid bucket assignment`
      : `${unclassified.length} unclassified, ${invalid.length} invalid bucket assignments`,
    details: {
      totalUsages: usages.length,
      unclassifiedCount: unclassified.length,
      invalidCount: invalid.length,
      sampleUnclassified: unclassified.slice(0, 5).map(u => ({
        component: u.componentName,
        file: u.filePath,
      })),
    },
  };
}

/**
 * Check that bucket counts sum to total (no double counting).
 */
export function checkNoDoubleCounting(
  adoption: number,
  shadow: number,
  neither: number,
  total: number
): InvariantCheck {
  const sum = adoption + shadow + neither;
  const passed = sum === total;

  return {
    name: 'no-double-counting',
    passed,
    message: passed
      ? `Bucket sum (${sum}) equals total (${total})`
      : `Bucket sum (${sum}) does not equal total (${total})`,
    details: {
      adoption,
      shadow,
      neither,
      sum,
      total,
      difference: sum - total,
    },
  };
}

/**
 * Check that direct adoption <= effective adoption proxy.
 */
export function checkDirectLTEffective(
  directPercentage: number,
  effectivePercentage: number
): InvariantCheck {
  const passed = directPercentage <= effectivePercentage + 0.01; // Small epsilon for floats

  return {
    name: 'direct-lte-effective',
    passed,
    message: passed
      ? `Direct (${directPercentage.toFixed(2)}%) <= Effective (${effectivePercentage.toFixed(2)}%)`
      : `Direct (${directPercentage.toFixed(2)}%) > Effective (${effectivePercentage.toFixed(2)}%)`,
    details: {
      directPercentage,
      effectivePercentage,
      difference: effectivePercentage - directPercentage,
    },
  };
}

/**
 * Check that proxy metrics are explicitly marked.
 */
export function checkProxyMarked(
  effectiveIsProxy: boolean,
  shadowIsProxy: boolean
): InvariantCheck {
  const passed = effectiveIsProxy && shadowIsProxy;

  return {
    name: 'proxy-marked',
    passed,
    message: passed
      ? 'All proxy metrics are explicitly marked'
      : `Proxy metrics not marked: effective=${effectiveIsProxy}, shadow=${shadowIsProxy}`,
    details: {
      effectiveIsProxy,
      shadowIsProxy,
    },
  };
}

/**
 * Check that unmapped routes are visible in warnings.
 */
export function checkUnmappedRoutesVisible(
  unmappedCount: number,
  warnings: string[]
): InvariantCheck {
  const hasUnmappedWarning = warnings.some(
    w => w.toLowerCase().includes('unmapped') || w.toLowerCase().includes('route')
  );

  const passed = unmappedCount === 0 || hasUnmappedWarning;

  return {
    name: 'unmapped-routes-visible',
    passed,
    message: passed
      ? unmappedCount === 0
        ? 'All routes mapped'
        : `${unmappedCount} unmapped routes are visible in warnings`
      : `${unmappedCount} unmapped routes but no warning present`,
    details: {
      unmappedCount,
      hasUnmappedWarning,
      warningCount: warnings.length,
    },
  };
}

/**
 * Check that bucket percentages sum to ~100%.
 */
export function checkBucketPercentagesSum(
  adoptionPct: number,
  shadowPct: number,
  neitherPct: number
): InvariantCheck {
  const sum = adoptionPct + shadowPct + neitherPct;
  const passed = Math.abs(sum - 100) < 0.1; // Allow 0.1% rounding error

  return {
    name: 'bucket-percentages-sum',
    passed,
    message: passed
      ? `Bucket percentages sum to ${sum.toFixed(2)}%`
      : `Bucket percentages sum to ${sum.toFixed(2)}% (expected ~100%)`,
    details: {
      adoptionPct,
      shadowPct,
      neitherPct,
      sum,
      expected: 100,
      deviation: sum - 100,
    },
  };
}

// ─── Report-Level Invariant Checks ────────────────────────────────────────────

/**
 * Run all invariant checks on a V2 report.
 */
export function checkReportInvariants(report: ScanReportV2): InvariantReport {
  const checks: InvariantCheck[] = [];

  // Check bucket percentages sum
  checks.push(
    checkBucketPercentagesSum(
      report.summary.bucketBreakdown.adoption.percentage,
      report.summary.bucketBreakdown.shadow.percentage,
      report.summary.bucketBreakdown.neither.percentage
    )
  );

  // Check direct <= effective
  checks.push(
    checkDirectLTEffective(
      report.summary.directAdoption.percentage,
      report.summary.effectiveAdoptionProxy.percentage
    )
  );

  // Check proxy marked
  checks.push(
    checkProxyMarked(
      report.summary.effectiveAdoptionProxy.isProxy,
      report.summary.shadowUsageProxy.isProxy
    )
  );

  // Check unmapped routes visible
  checks.push(
    checkUnmappedRoutesVisible(
      report.summary.routeCoverage.unmappedFiles,
      report.summary.routeCoverage.warnings
    )
  );

  // Check no double counting in summary
  const { adoption, shadow, neither } = report.summary.bucketBreakdown;
  const totalInstances = adoption.instances + shadow.instances + neither.instances;
  checks.push(
    checkNoDoubleCounting(
      adoption.instances,
      shadow.instances,
      neither.instances,
      totalInstances
    )
  );

  return {
    allPassed: checks.every(c => c.passed),
    checks,
    timestamp: new Date().toISOString(),
  };
}

// ─── Usage-Level Invariant Checks ─────────────────────────────────────────────

/**
 * Validate a single classified usage.
 */
export function validateClassifiedUsage(usage: ClassifiedUsage): InvariantCheck[] {
  const checks: InvariantCheck[] = [];

  // Bucket must be valid
  const validBuckets: AnalyticalBucket[] = ['adoption', 'shadow', 'neither'];
  checks.push({
    name: 'usage-valid-bucket',
    passed: validBuckets.includes(usage.analyticalBucket),
    message: validBuckets.includes(usage.analyticalBucket)
      ? `Bucket ${usage.analyticalBucket} is valid`
      : `Invalid bucket: ${usage.analyticalBucket}`,
    details: { bucket: usage.analyticalBucket, component: usage.componentName },
  });

  // Shadow usages should have signals
  if (usage.analyticalBucket === 'shadow') {
    const hasSignals = usage.shadowSignals && usage.shadowSignals.length > 0;
    checks.push({
      name: 'usage-shadow-has-signals',
      passed: hasSignals,
      message: hasSignals
        ? `Shadow usage has ${usage.shadowSignals!.length} signals`
        : 'Shadow usage has no signals',
      details: { component: usage.componentName, signals: usage.shadowSignals },
    });
  }

  // Adoption should have DS source
  if (usage.analyticalBucket === 'adoption') {
    const hasDsSource =
      usage.classificationSource === 'direct-ds' ||
      usage.classificationSource === 'ds-backed-wrapper' ||
      usage.classificationSource === 'transitive-declared' ||
      usage.classificationSource === 'transitive-auto';

    checks.push({
      name: 'usage-adoption-has-ds-source',
      passed: hasDsSource,
      message: hasDsSource
        ? `Adoption has valid DS source: ${usage.classificationSource}`
        : `Adoption has unexpected source: ${usage.classificationSource}`,
      details: { source: usage.classificationSource, component: usage.componentName },
    });
  }

  return checks;
}

// ─── Batch Validation ─────────────────────────────────────────────────────────

/**
 * Validate a batch of classified usages.
 */
export function validateClassifiedUsages(usages: ClassifiedUsage[]): {
  allPassed: boolean;
  checks: InvariantCheck[];
  byUsage: Map<string, InvariantCheck[]>;
} {
  const allChecks: InvariantCheck[] = [];
  const byUsage = new Map<string, InvariantCheck[]>();

  for (const usage of usages) {
    const usageChecks = validateClassifiedUsage(usage);
    byUsage.set(`${usage.filePath}:${usage.line}:${usage.componentName}`, usageChecks);
    allChecks.push(...usageChecks);
  }

  // Add aggregate checks
  allChecks.push(checkBucketExclusivity(usages));

  return {
    allPassed: allChecks.every(c => c.passed),
    checks: allChecks,
    byUsage,
  };
}
