import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { runScanV2 } from '../../src/scanner/orchestrator-v2.js';
import type { ResolvedConfig } from '../../src/config/schema.js';
import type { ScanReportV2 } from '../../src/domain/types.js';

const FIXTURES = path.resolve('tests/fixtures');

function makeConfig(
  repoRelPath: string,
  overrides: Partial<ResolvedConfig> = {}
): ResolvedConfig {
  return {
    repositories: [path.join(FIXTURES, repoRelPath)],
    designSystems: [
      { name: 'TUI', packages: ['@tui/components', '@tui/icons', '@tui/overlay'] },
      { name: 'Beaver', packages: ['beaver-ui', 'beaver-ui/*'] },
    ],
    include: ['src/**/*.{ts,tsx,js,jsx}'],
    exclude: ['**/node_modules/**', '**/*.d.ts'],
    localLibraryPatterns: ['@shared/components', '@shared/components/*', '**/shared/ui/**'],
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
        enabled: false,
        preferredResolver: undefined,
        enableFallback: false,
        fallbackBoundaryDirs: [],
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
    ...overrides,
  };
}

// ── simple-repo ───────────────────────────────────────────────────────────────

describe('integration — simple-repo', () => {
  let report: ScanReportV2;

  beforeAll(async () => {
    report = await runScanV2(makeConfig('simple-repo'), {
      configPath: 'test',
    });
  });

  it('scanned 2 files', () => {
    expect(report.meta.filesScanned).toBe(2);
  });

  it('reports 1 repository', () => {
    expect(report.byRepository).toHaveLength(1);
    expect(report.byRepository[0]!.name).toBe('simple-repo');
  });

  it('has adoption bucket with DS components', () => {
    // In V2, direct DS usages go to adoption bucket
    expect(report.summary.bucketBreakdown.adoption.instances).toBeGreaterThan(0);
  });

  it('TUI is in byDesignSystem with instances', () => {
    const tui = report.byDesignSystem.find(d => d.name === 'TUI')!;
    expect(tui).toBeDefined();
    expect(tui.instances).toBeGreaterThan(0);
  });

  it('Beaver is in byDesignSystem with instances', () => {
    const beaver = report.byDesignSystem.find(d => d.name === 'Beaver')!;
    expect(beaver).toBeDefined();
    expect(beaver.instances).toBeGreaterThan(0);
  });

  it('byComponent.adoption contains TUI components', () => {
    const tuiComps = report.byComponent.adoption.filter(c => c.dsName === 'TUI');
    expect(tuiComps.length).toBeGreaterThan(0);
    const names = tuiComps.map(c => c.componentName);
    expect(names).toContain('Button');
    expect(names).toContain('Input');
  });

  it('meta contains version and timestamp', () => {
    expect(report.version).toBe('2.0');
    expect(report.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.meta.scanDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('meta lists configured design systems', () => {
    expect(report.meta.designSystemsConfigured).toContain('TUI');
    expect(report.meta.designSystemsConfigured).toContain('Beaver');
  });
});

// ── namespace-imports ─────────────────────────────────────────────────────────

describe('integration — namespace-imports', () => {
  let report: ScanReportV2;

  beforeAll(async () => {
    report = await runScanV2(makeConfig('namespace-imports'), { configPath: 'test' });
  });

  it('scanned at least 1 file', () => {
    expect(report.meta.filesScanned).toBeGreaterThan(0);
  });

  it('categorizes DS.Button as design-system (TUI)', () => {
    const tuiComps = report.byComponent.adoption.filter(c => c.dsName === 'TUI');
    expect(tuiComps.length).toBeGreaterThan(0);
    const names = tuiComps.map(c => c.componentName);
    expect(names.some(n => n.includes('Button'))).toBe(true);
  });

  it('adoption rate > 0 (DS components via namespace)', () => {
    expect(report.summary.directAdoption.percentage).toBeGreaterThan(0);
  });
});

// ── barrel-exports ────────────────────────────────────────────────────────────

describe('integration — barrel-exports', () => {
  let report: ScanReportV2;

  beforeAll(async () => {
    report = await runScanV2(makeConfig('barrel-exports'), { configPath: 'test' });
  });

  it('scanned files without errors', () => {
    expect(report.meta.filesScanned).toBeGreaterThan(0);
  });

  it('direct DS imports are in adoption bucket', () => {
    const tuiComps = report.byComponent.adoption.filter(c => c.dsName === 'TUI');
    const names = tuiComps.map(c => c.componentName);
    expect(names).toContain('Button');
    expect(names).toContain('Input');
  });

  it('Modal from @tui/overlay is design-system (TUI)', () => {
    const tuiComps = report.byComponent.adoption.filter(c => c.dsName === 'TUI');
    const names = tuiComps.map(c => c.componentName);
    expect(names).toContain('Modal');
  });
});

// ── mixed-categories ──────────────────────────────────────────────────────────

describe('integration — mixed-categories', () => {
  let report: ScanReportV2;

  beforeAll(async () => {
    report = await runScanV2(makeConfig('mixed-categories'), { configPath: 'test' });
  });

  it('has adoption instances from design-system', () => {
    expect(report.summary.bucketBreakdown.adoption.instances).toBeGreaterThan(0);
  });

  it('has shadow or neither instances from local components', () => {
    const localBuckets =
      report.summary.bucketBreakdown.shadow.instances +
      report.summary.bucketBreakdown.neither.instances;
    expect(localBuckets).toBeGreaterThan(0);
  });

  it('TUI and Beaver both have instances', () => {
    const tui = report.byDesignSystem.find(d => d.name === 'TUI')!;
    const beaver = report.byDesignSystem.find(d => d.name === 'Beaver')!;
    expect(tui.instances).toBeGreaterThan(0);
    expect(beaver.instances).toBeGreaterThan(0);
  });
});

// ── multi-repo ────────────────────────────────────────────────────────────────

describe('integration — multi-repo aggregation', () => {
  let report: ScanReportV2;

  beforeAll(async () => {
    const config: ResolvedConfig = {
      repositories: [
        path.join(FIXTURES, 'simple-repo'),
        path.join(FIXTURES, 'namespace-imports'),
      ],
      designSystems: [
        { name: 'TUI', packages: ['@tui/components', '@tui/icons', '@tui/overlay'] },
        { name: 'Beaver', packages: ['beaver-ui', 'beaver-ui/*'] },
      ],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**'],
      localLibraryPatterns: ['@shared/components'],
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
          enabled: false,
          preferredResolver: undefined,
          enableFallback: false,
          fallbackBoundaryDirs: [],
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

    report = await runScanV2(config, { configPath: 'test' });
  });

  it('reports 2 repositories', () => {
    expect(report.byRepository).toHaveLength(2);
  });

  it('global adoption is aggregated across repos', () => {
    expect(report.summary.directAdoption.percentage).toBeGreaterThan(0);
    expect(report.summary.directAdoption.percentage).toBeLessThanOrEqual(100);
  });

  it('designSystemsConfigured includes both DS', () => {
    expect(report.meta.designSystemsConfigured).toContain('TUI');
    expect(report.meta.designSystemsConfigured).toContain('Beaver');
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────

describe('integration — edge cases', () => {
  it('handles missing repository gracefully (skips with warning)', async () => {
    const config = makeConfig('simple-repo', {
      repositories: [
        path.join(FIXTURES, 'simple-repo'),
        '/nonexistent/repo/that/does/not/exist',
      ],
    });

    // Should not throw — just skip the missing repo
    const report = await runScanV2(config, { configPath: 'test' });
    expect(report.byRepository).toHaveLength(1);
  });

  it('handles empty repository (no matching files)', async () => {
    const config = makeConfig('simple-repo', {
      repositories: [path.join(FIXTURES, 'simple-repo')],
      include: ['src/**/*.nonexistent'],
    });

    const report = await runScanV2(config, { configPath: 'test' });
    expect(report.meta.filesScanned).toBe(0);
    expect(report.summary.directAdoption.percentage).toBe(0);
  });

  it('scan report has valid JSON structure', async () => {
    const report = await runScanV2(makeConfig('simple-repo'), { configPath: 'test' });
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json) as ScanReportV2;
    expect(parsed.meta).toBeDefined();
    expect(parsed.summary).toBeDefined();
    expect(parsed.byRepository).toBeDefined();
    expect(parsed.byComponent).toBeDefined();
  });
});
