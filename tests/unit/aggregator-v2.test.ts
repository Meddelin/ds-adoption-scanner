import { describe, expect, it } from 'vitest';
import { aggregateCrossRepository } from '../../src/metrics/aggregator-v2.js';
import type { ClassifiedUsage, RepositoryMetricsV2 } from '../../src/domain/types.js';
import type { ResolvedConfig } from '../../src/config/schema.js';

function makeConfig(): ResolvedConfig {
  return {
    repositories: [],
    designSystems: [],
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

function makeRepoMetric(): RepositoryMetricsV2 {
  return {
    name: 'repo',
    path: '/repo',
    filesScanned: 10,
    directAdoption: {
      percentage: 10,
      instances: 1,
      components: 1,
      isProxy: false,
      formula: '',
      denominator: { instances: 10, components: 10, explanation: '' },
    },
    effectiveAdoptionProxy: {
      percentage: 20,
      instances: 2,
      components: 2,
      isProxy: true,
      formula: '',
      denominator: { instances: 10, components: 10, explanation: '' },
    },
    shadowUsageProxy: {
      percentage: 10,
      instances: 1,
      components: 1,
      isProxy: true,
      formula: '',
      denominator: { instances: 10, components: 10, explanation: '' },
    },
    bucketBreakdown: {
      adoption: { instances: 2, components: 2, percentage: 20, topComponents: ['A', 'B'] },
      shadow: { instances: 1, components: 1, percentage: 10, topComponents: ['S'] },
      neither: { instances: 7, components: 7, percentage: 70, topComponents: ['N'] },
    },
    designSystems: [],
    routes: [],
  };
}

function usage(partial: Partial<ClassifiedUsage> & Pick<ClassifiedUsage, 'componentName' | 'category' | 'analyticalBucket' | 'classificationSource'>): ClassifiedUsage {
  return {
    componentName: partial.componentName,
    localName: partial.componentName,
    importEntry: partial.importEntry ?? null,
    filePath: partial.filePath ?? '/repo/src/App.tsx',
    line: 1,
    column: 1,
    props: [],
    hasSpreadProps: false,
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

describe('aggregateCrossRepository', () => {
  it('uses direct DS instances for summary direct adoption', () => {
    const repoMetrics = [makeRepoMetric()];
    const usages = new Map<string, ClassifiedUsage[]>([
      [
        'repo',
        [
          usage({
            componentName: 'Button',
            category: 'design-system',
            analyticalBucket: 'adoption',
            classificationSource: 'direct-ds',
            dsName: 'DS',
            packageName: '@ds/ui',
          }),
          usage({
            componentName: 'WrappedButton',
            category: 'local-library',
            analyticalBucket: 'adoption',
            classificationSource: 'transitive-auto',
            resolvedPath: '/repo/src/shared/WrappedButton.tsx',
            transitiveDS: { dsName: 'DS', coverage: 1, source: 'auto-detected' },
          }),
          usage({
            componentName: 'LocalCard',
            category: 'local',
            analyticalBucket: 'shadow',
            classificationSource: 'local-ui-signal',
            resolvedPath: '/repo/src/shared/LocalCard.tsx',
          }),
        ],
      ],
    ]);

    const report = aggregateCrossRepository(
      repoMetrics,
      usages,
      new Map(),
      makeConfig(),
      100,
      10
    );

    expect(report.summary.directAdoption.instances).toBe(1);
    expect(report.summary.directAdoption.percentage).toBeCloseTo(33.33, 1);
  });
});
