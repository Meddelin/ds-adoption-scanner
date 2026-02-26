import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../../src/metrics/calculator.js';
import type { CategorizedUsage } from '../../src/types.js';
import type { ResolvedConfig } from '../../src/config/schema.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(dsNames = ['TUI', 'Beaver']): ResolvedConfig {
  return {
    repositories: [],
    designSystems: dsNames.map(name => ({ name, packages: [`@${name.toLowerCase()}/components`] })),
    include: [],
    exclude: [],
    localLibraryPatterns: [],
    trackedThirdParty: [],
    tsconfig: 'tsconfig.json',
    historyDir: '.ds-metrics',
    output: { format: 'table', verbose: false },
    thresholds: {},
  };
}

function makeUsage(
  name: string,
  category: CategorizedUsage['category'],
  dsName: string | null = null,
  filePath = '/repo/src/App.tsx',
  props: string[] = []
): CategorizedUsage {
  return {
    componentName: name,
    localName: name,
    importEntry: null,
    filePath,
    line: 1,
    column: 0,
    props,
    hasSpreadProps: false,
    category,
    dsName,
    packageName: null,
    resolvedPath: null,
  };
}

// ── Adoption formula ──────────────────────────────────────────────────────────

describe('calculateMetrics — adoption formula', () => {
  it('computes 60% adoption for the spec example', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Button', 'design-system', 'TUI'),
      makeUsage('Input', 'design-system', 'TUI'),
      makeUsage('PageLayout', 'design-system', 'Beaver'),
      makeUsage('SharedLayout', 'local-library'),
      makeUsage('CustomCard', 'local'),
      makeUsage('Select', 'third-party'),  // excluded from denominator
      makeUsage('div', 'html-native'),     // excluded from denominator
    ];

    const metrics = calculateMetrics(usages, makeConfig(), 1);
    // DS=3, localLib=1, local=1 → denom=5, adoption=3/5=60%
    expect(metrics.adoptionRate).toBeCloseTo(60, 5);
  });

  it('excludes third-party and html-native from denominator', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Button', 'design-system', 'TUI'),
      makeUsage('div', 'html-native'),
      makeUsage('span', 'html-native'),
      makeUsage('Select', 'third-party'),
      makeUsage('Tooltip', 'third-party'),
    ];

    const metrics = calculateMetrics(usages, makeConfig(), 1);
    // Only DS in denominator → 1/(1+0+0) = 100%
    expect(metrics.adoptionRate).toBeCloseTo(100, 5);
  });

  it('returns 0% adoption when no DS usage', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('LocalCard', 'local'),
      makeUsage('div', 'html-native'),
    ];
    const metrics = calculateMetrics(usages, makeConfig(), 1);
    expect(metrics.adoptionRate).toBe(0);
  });

  it('returns 0% when denominator is zero (only html/third-party)', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('div', 'html-native'),
      makeUsage('Select', 'third-party'),
    ];
    const metrics = calculateMetrics(usages, makeConfig(), 1);
    expect(metrics.adoptionRate).toBe(0);
  });

  it('returns 100% when all non-html/third-party are DS', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Button', 'design-system', 'TUI'),
      makeUsage('Input', 'design-system', 'TUI'),
      makeUsage('div', 'html-native'),
    ];
    const metrics = calculateMetrics(usages, makeConfig(), 1);
    expect(metrics.adoptionRate).toBeCloseTo(100, 5);
  });
});

// ── Per-DS breakdown ──────────────────────────────────────────────────────────

describe('calculateMetrics — per-DS breakdown', () => {
  it('computes per-DS adoption rates that sum to total', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Button', 'design-system', 'TUI'),
      makeUsage('Input', 'design-system', 'TUI'),
      makeUsage('PageLayout', 'design-system', 'Beaver'),
      makeUsage('CustomCard', 'local'),
      makeUsage('SharedLib', 'local-library'),
    ];

    const metrics = calculateMetrics(usages, makeConfig(), 2);
    // denom = 3+1+1 = 5
    const tui = metrics.designSystems.find(d => d.name === 'TUI')!;
    const beaver = metrics.designSystems.find(d => d.name === 'Beaver')!;

    expect(tui.adoptionRate).toBeCloseTo(40, 5);    // 2/5
    expect(beaver.adoptionRate).toBeCloseTo(20, 5); // 1/5

    // Sum of per-DS rates + local + localLib = 100%
    const localLibRate = (1 / 5) * 100;
    const localRate = (1 / 5) * 100;
    const sum = tui.adoptionRate + beaver.adoptionRate + localLibRate + localRate;
    expect(sum).toBeCloseTo(100, 5);
  });

  it('correctly reports 0 instances for DS with no usage', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Button', 'design-system', 'TUI'),
    ];
    const metrics = calculateMetrics(usages, makeConfig(), 1);
    const beaver = metrics.designSystems.find(d => d.name === 'Beaver')!;
    expect(beaver.instances).toBe(0);
    expect(beaver.adoptionRate).toBe(0);
  });
});

// ── Category metrics ──────────────────────────────────────────────────────────

describe('calculateMetrics — category metrics', () => {
  it('counts instances and unique components correctly', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Button', 'design-system', 'TUI', '/repo/src/App.tsx'),
      makeUsage('Button', 'design-system', 'TUI', '/repo/src/Page.tsx'),
      makeUsage('Input', 'design-system', 'TUI', '/repo/src/App.tsx'),
    ];

    const metrics = calculateMetrics(usages, makeConfig(), 2);
    expect(metrics.designSystemTotal.instances).toBe(3);
    expect(metrics.designSystemTotal.uniqueComponents).toBe(2); // Button, Input
  });

  it('top components sorted by instance count', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Input', 'design-system', 'TUI'),
      makeUsage('Button', 'design-system', 'TUI'),
      makeUsage('Button', 'design-system', 'TUI'),
      makeUsage('Button', 'design-system', 'TUI'),
    ];

    const metrics = calculateMetrics(usages, makeConfig(), 1);
    expect(metrics.designSystemTotal.topComponents[0]!.name).toBe('Button');
    expect(metrics.designSystemTotal.topComponents[0]!.instances).toBe(3);
  });

  it('computes filesUsedIn correctly', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Button', 'design-system', 'TUI', '/repo/src/A.tsx'),
      makeUsage('Button', 'design-system', 'TUI', '/repo/src/A.tsx'), // same file
      makeUsage('Button', 'design-system', 'TUI', '/repo/src/B.tsx'), // different file
    ];

    const metrics = calculateMetrics(usages, makeConfig(), 2);
    const btn = metrics.designSystemTotal.topComponents.find(c => c.name === 'Button')!;
    expect(btn.filesUsedIn).toBe(2);
    expect(btn.instances).toBe(3);
  });
});

// ── File penetration ──────────────────────────────────────────────────────────

describe('calculateMetrics — file penetration', () => {
  it('calculates file penetration correctly', () => {
    const usages: CategorizedUsage[] = [
      makeUsage('Button', 'design-system', 'TUI', '/repo/src/A.tsx'),
      makeUsage('Input', 'local', null, '/repo/src/B.tsx'),
    ];

    // 1 of 2 files has DS import
    const metrics = calculateMetrics(usages, makeConfig(), 2);
    expect(metrics.filePenetration).toBeCloseTo(50, 5);
  });

  it('returns 0 penetration when no DS usage', () => {
    const usages: CategorizedUsage[] = [makeUsage('Card', 'local')];
    const metrics = calculateMetrics(usages, makeConfig(), 3);
    expect(metrics.filePenetration).toBe(0);
  });
});

// ── Props aggregation ─────────────────────────────────────────────────────────

describe('calculateMetrics — props in topComponents', () => {
  it('aggregates topProps by frequency', () => {
    const usages: CategorizedUsage[] = [
      { ...makeUsage('Button', 'design-system', 'TUI'), props: ['variant', 'size'] },
      { ...makeUsage('Button', 'design-system', 'TUI'), props: ['variant', 'disabled'] },
      { ...makeUsage('Button', 'design-system', 'TUI'), props: ['variant'] },
    ];

    const metrics = calculateMetrics(usages, makeConfig(), 1);
    const btn = metrics.designSystemTotal.topComponents[0]!;
    const variantProp = btn.topProps.find(p => p.name === 'variant')!;
    expect(variantProp.count).toBe(3);
  });
});
