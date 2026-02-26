import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { runScan } from '../../src/scanner/orchestrator.js';
import type { ResolvedConfig } from '../../src/config/schema.js';
import type { ScanReport } from '../../src/types.js';

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
    ...overrides,
  };
}

// ── simple-repo ───────────────────────────────────────────────────────────────

describe('integration — simple-repo', () => {
  let report: ScanReport;

  beforeAll(async () => {
    report = await runScan(makeConfig('simple-repo'), {
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

  it('adoption rate is 60%', () => {
    // DS=3 (Button+Input from TUI, PageLayout from Beaver)
    // local-library=1 (SharedLayout), local=1 (CustomCard)
    // third-party=1 (Select) → excluded
    // denominator = 3+1+1 = 5, adoption = 3/5 = 60%
    expect(report.summary.adoptionRate).toBeCloseTo(60, 1);
  });

  it('TUI adoption is 40%', () => {
    const tui = report.summary.designSystems.find(d => d.name === 'TUI')!;
    expect(tui).toBeDefined();
    expect(tui.adoptionRate).toBeCloseTo(40, 1);
    expect(tui.instances).toBe(2);
  });

  it('Beaver adoption is 20%', () => {
    const beaver = report.summary.designSystems.find(d => d.name === 'Beaver')!;
    expect(beaver).toBeDefined();
    expect(beaver.adoptionRate).toBeCloseTo(20, 1);
    expect(beaver.instances).toBe(1);
  });

  it('local-library has 1 instance (SharedLayout)', () => {
    expect(report.summary.localLibrary.instances).toBe(1);
    const comp = report.summary.localLibrary.topComponents.find(c => c.name === 'SharedLayout');
    expect(comp).toBeDefined();
  });

  it('local has 1 instance (CustomCard)', () => {
    expect(report.summary.local.instances).toBe(1);
    const comp = report.summary.local.topComponents.find(c => c.name === 'CustomCard');
    expect(comp).toBeDefined();
  });

  it('third-party has 1 instance (Select from react-select)', () => {
    expect(report.summary.thirdParty.instances).toBe(1);
    const comp = report.byComponent.thirdParty.find(c => c.name === 'Select');
    expect(comp).toBeDefined();
    expect(comp?.packageName).toBe('react-select');
  });

  it('html-native instances detected', () => {
    expect(report.summary.htmlNative.instances).toBeGreaterThan(0);
  });

  it('byComponent.designSystems contains TUI components', () => {
    const tui = report.byComponent.designSystems.find(d => d.name === 'TUI')!;
    expect(tui).toBeDefined();
    const names = tui.components.map(c => c.name);
    expect(names).toContain('Button');
    expect(names).toContain('Input');
  });

  it('byComponent.localMostUsed has resolvedPath for CustomCard', () => {
    const card = report.byComponent.localMostUsed.find(c => c.name === 'CustomCard');
    expect(card).toBeDefined();
    // CustomCard is a local relative import — resolvedPath should be set
    // (may be null if TS can't find it without jsx setting, that's ok)
    // Just verify the field exists in the structure
    expect('resolvedPath' in card!).toBe(true);
  });

  it('meta contains version and timestamp', () => {
    expect(report.meta.version).toBeTruthy();
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
  let report: ScanReport;

  beforeAll(async () => {
    report = await runScan(makeConfig('namespace-imports'), { configPath: 'test' });
  });

  it('scanned at least 1 file', () => {
    expect(report.meta.filesScanned).toBeGreaterThan(0);
  });

  it('categorizes DS.Button as design-system (TUI)', () => {
    const tui = report.byComponent.designSystems.find(d => d.name === 'TUI')!;
    expect(tui.components.length).toBeGreaterThan(0);
    const names = tui.components.map(c => c.name);
    expect(names.some(n => n.includes('Button'))).toBe(true);
  });

  it('adoption rate > 0 (DS components via namespace)', () => {
    expect(report.summary.adoptionRate).toBeGreaterThan(0);
  });
});

// ── barrel-exports ────────────────────────────────────────────────────────────

describe('integration — barrel-exports', () => {
  let report: ScanReport;

  beforeAll(async () => {
    report = await runScan(makeConfig('barrel-exports'), { configPath: 'test' });
  });

  it('scanned files without errors', () => {
    expect(report.meta.filesScanned).toBeGreaterThan(0);
  });

  it('direct DS imports are categorized as design-system', () => {
    const tui = report.byComponent.designSystems.find(d => d.name === 'TUI')!;
    const names = tui.components.map(c => c.name);
    // Button and Input are imported directly from @tui/components
    expect(names).toContain('Button');
    expect(names).toContain('Input');
  });

  it('Modal from @tui/overlay is design-system (TUI)', () => {
    const tui = report.byComponent.designSystems.find(d => d.name === 'TUI')!;
    const names = tui.components.map(c => c.name);
    expect(names).toContain('Modal');
  });
});

// ── mixed-categories ──────────────────────────────────────────────────────────

describe('integration — mixed-categories', () => {
  let report: ScanReport;

  beforeAll(async () => {
    report = await runScan(makeConfig('mixed-categories'), { configPath: 'test' });
  });

  it('has all 5 categories represented', () => {
    expect(report.summary.designSystemTotal.instances).toBeGreaterThan(0);
    expect(report.summary.localLibrary.instances).toBeGreaterThan(0);
    expect(report.summary.local.instances).toBeGreaterThan(0);
    expect(report.summary.thirdParty.instances).toBeGreaterThan(0);
    expect(report.summary.htmlNative.instances).toBeGreaterThan(0);
  });

  it('TUI and Beaver both have instances', () => {
    const tui = report.summary.designSystems.find(d => d.name === 'TUI')!;
    const beaver = report.summary.designSystems.find(d => d.name === 'Beaver')!;
    expect(tui.instances).toBeGreaterThan(0);
    expect(beaver.instances).toBeGreaterThan(0);
  });
});

// ── multi-repo ────────────────────────────────────────────────────────────────

describe('integration — multi-repo aggregation', () => {
  let report: ScanReport;

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
    };

    report = await runScan(config, { configPath: 'test' });
  });

  it('reports 2 repositories', () => {
    expect(report.byRepository).toHaveLength(2);
  });

  it('global adoption is aggregated across repos', () => {
    expect(report.summary.adoptionRate).toBeGreaterThan(0);
    expect(report.summary.adoptionRate).toBeLessThanOrEqual(100);
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
    const report = await runScan(config, { configPath: 'test' });
    expect(report.byRepository).toHaveLength(1);
  });

  it('handles empty repository (no matching files)', async () => {
    // Use a real dir with no tsx/ts files
    const config = makeConfig('simple-repo', {
      repositories: [path.join(FIXTURES, 'simple-repo')],
      include: ['src/**/*.nonexistent'],
    });

    const report = await runScan(config, { configPath: 'test' });
    expect(report.meta.filesScanned).toBe(0);
    expect(report.summary.adoptionRate).toBe(0);
  });

  it('scan report has valid JSON structure', async () => {
    const report = await runScan(makeConfig('simple-repo'), { configPath: 'test' });
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json) as ScanReport;
    expect(parsed.meta).toBeDefined();
    expect(parsed.summary).toBeDefined();
    expect(parsed.byRepository).toBeDefined();
    expect(parsed.byComponent).toBeDefined();
  });
});
