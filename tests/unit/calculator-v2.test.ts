import { describe, expect, it } from 'vitest';
import { calculateMetricsV2 } from '../../src/metrics/calculator-v2.js';
import type { ClassifiedUsage } from '../../src/domain/types.js';
import type { ResolvedConfig } from '../../src/config/schema.js';

function makeConfig(): ResolvedConfig {
  return {
    repositories: [],
    designSystems: [{ name: 'DS', packages: ['@ds/ui'] }],
    include: [],
    exclude: [],
    localLibraryPatterns: [],
    trackedThirdParty: [],
    tsconfig: 'tsconfig.json',
    historyDir: '.ds-metrics',
    output: { format: 'table', verbose: false },
    thresholds: {},
    transitiveRules: [],
    transitiveAdoption: { enabled: false },
    libraries: [],
    excludeLocalFromAdoption: false,
    excludeUniqueLocalFromAdoption: false,
    reusableThreshold: 2,
  };
}

function usage(
  partial: Partial<ClassifiedUsage> & Pick<ClassifiedUsage, 'componentName' | 'category' | 'analyticalBucket' | 'classificationSource'>
): ClassifiedUsage {
  return {
    componentName: partial.componentName,
    localName: partial.componentName,
    importEntry: partial.importEntry ?? null,
    filePath: partial.filePath ?? '/repo/src/App.tsx',
    line: partial.line ?? 1,
    column: partial.column ?? 1,
    props: partial.props ?? [],
    hasSpreadProps: partial.hasSpreadProps ?? false,
    category: partial.category,
    dsName: partial.dsName ?? null,
    packageName: partial.packageName ?? null,
    resolvedPath: partial.resolvedPath ?? null,
    analyticalBucket: partial.analyticalBucket,
    classificationSource: partial.classificationSource,
    classificationConfidence: partial.classificationConfidence ?? 'high',
    transitiveDS: partial.transitiveDS,
    shadowSignals: partial.shadowSignals,
    routeId: partial.routeId,
    routeConfidence: partial.routeConfidence,
  };
}

describe('calculateMetricsV2', () => {
  it('excludes html-native and non-DS third-party from denominator', () => {
    const usages: ClassifiedUsage[] = [
      usage({
        componentName: 'Button',
        category: 'design-system',
        analyticalBucket: 'adoption',
        classificationSource: 'direct-ds',
        dsName: 'DS',
        packageName: '@ds/ui',
      }),
      usage({
        componentName: 'div',
        category: 'html-native',
        analyticalBucket: 'neither',
        classificationSource: 'utility-heuristic',
      }),
      usage({
        componentName: 'Select',
        category: 'third-party',
        analyticalBucket: 'neither',
        classificationSource: 'utility-heuristic',
        packageName: 'react-select',
      }),
    ];

    const metrics = calculateMetricsV2(usages, [], {
      config: makeConfig(),
      repoPath: '/repo',
      filesScanned: 1,
    });

    expect(metrics.directAdoption.denominator.instances).toBe(1);
    expect(metrics.directAdoption.percentage).toBe(100);
    expect(metrics.bucketBreakdown.adoption.instances).toBe(1);
    expect(metrics.bucketBreakdown.neither.instances).toBe(0);
  });
});
