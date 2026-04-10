import { describe, expect, it } from 'vitest';
import { calculateMetricsV2, calculateRouteMetrics } from '../../src/metrics/calculator-v2.js';
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
    v2: {
      enabled: true,
      routeResolution: {
        enabled: true,
        preferredResolver: undefined,
        enableFallback: true,
        fallbackBoundaryDirs: ['pages', 'routes', 'views', 'screens', 'features', 'app'],
      },
      classification: {
        shadowDetection: true,
        neitherDetection: true,
        thirdPartyWithoutDSBucket: 'neither',
        thresholds: {
          reusableFileThreshold: 2,
          shadowFileThreshold: 2,
          shadowRouteThreshold: 2,
          substantialMarkupThreshold: 5,
        },
      },
      invariants: {
        enabled: true,
        failOnViolation: false,
      },
    },
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

  it('includes third-party in denominator when classified as shadow', () => {
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
        componentName: 'ReactSelect',
        category: 'third-party',
        analyticalBucket: 'shadow',
        classificationSource: 'local-ui-signal',
        packageName: 'react-select',
      }),
    ];

    const metrics = calculateMetricsV2(usages, [], {
      config: makeConfig(),
      repoPath: '/repo',
      filesScanned: 1,
    });

    expect(metrics.directAdoption.denominator.instances).toBe(2);
    expect(metrics.directAdoption.percentage).toBe(50);
    expect(metrics.bucketBreakdown.shadow.instances).toBe(1);
  });

  it('derives route confidence from usage-level confidence values', () => {
    const routeUsages: ClassifiedUsage[] = [
      usage({
        componentName: 'Button',
        category: 'design-system',
        analyticalBucket: 'adoption',
        classificationSource: 'direct-ds',
        routeId: '/dashboard',
        routeConfidence: 'low',
      }),
      usage({
        componentName: 'LocalCard',
        category: 'local',
        analyticalBucket: 'neither',
        classificationSource: 'utility-heuristic',
        routeId: '/dashboard',
        routeConfidence: 'medium',
      }),
    ];

    const routes = calculateRouteMetrics(routeUsages);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.confidence).toBe('medium');
    expect(routes[0]!.directAdoption.percentage).toBe(100);
  });
});
