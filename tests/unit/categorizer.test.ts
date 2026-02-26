import { describe, it, expect, vi } from 'vitest';
import { categorizeUsage, findDesignSystem } from '../../src/scanner/categorizer.js';
import type { JSXUsageRecord, ImportEntry } from '../../src/types.js';
import type { ResolvedConfig } from '../../src/config/schema.js';
import type { ImportResolver } from '../../src/scanner/import-resolver.js';
import type { ResolvedImport } from '../../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    repositories: [],
    designSystems: [
      { name: 'TUI', packages: ['@tui/components', '@tui/icons'] },
      { name: 'Beaver', packages: ['beaver-ui', 'beaver-ui/*'] },
    ],
    include: ['src/**/*.{ts,tsx}'],
    exclude: [],
    localLibraryPatterns: ['@shared/components', '@shared/components/*', '**/shared/ui/**'],
    trackedThirdParty: [],
    tsconfig: 'tsconfig.json',
    historyDir: '.ds-metrics',
    output: { format: 'table', verbose: false },
    thresholds: {},
    ...overrides,
  };
}

function makeImport(source: string, type: ImportEntry['type'] = 'named'): ImportEntry {
  return { localName: 'Comp', importedName: 'Comp', source, type };
}

function makeUsage(
  componentName: string,
  importEntry: ImportEntry | null,
  filePath = '/repo/src/App.tsx'
): JSXUsageRecord {
  return {
    componentName,
    localName: componentName.split('.')[0]!,
    importEntry,
    filePath,
    line: 1,
    column: 0,
    props: [],
    hasSpreadProps: false,
  };
}

function makeResolver(resolved: Partial<ResolvedImport> = {}): ImportResolver {
  return {
    resolve: vi.fn((): ResolvedImport => ({
      originalSource: '',
      resolvedPath: null,
      isNodeModule: false,
      packageName: null,
      ...resolved,
    })),
  } as unknown as ImportResolver;
}

// ── html-native ───────────────────────────────────────────────────────────────

describe('categorizer — html-native', () => {
  it('categorizes lowercase element as html-native', () => {
    const usage = makeUsage('div', null);
    const result = categorizeUsage(usage, makeConfig(), makeResolver());
    expect(result.category).toBe('html-native');
  });

  it('categorizes span, input, button as html-native', () => {
    for (const name of ['span', 'input', 'button', 'section', 'a', 'p']) {
      const result = categorizeUsage(makeUsage(name, null), makeConfig(), makeResolver());
      expect(result.category).toBe('html-native');
    }
  });

  it('does NOT categorize uppercase as html-native', () => {
    const usage = makeUsage('Button', makeImport('@tui/components'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: true, packageName: '@tui/components' }));
    expect(result.category).not.toBe('html-native');
  });
});

// ── local (no import) ─────────────────────────────────────────────────────────

describe('categorizer — local (no import entry)', () => {
  it('categorizes component with no importEntry as local', () => {
    const usage = makeUsage('CustomCard', null);
    const result = categorizeUsage(usage, makeConfig(), makeResolver());
    expect(result.category).toBe('local');
    expect(result.dsName).toBeNull();
  });
});

// ── design-system ─────────────────────────────────────────────────────────────

describe('categorizer — design-system', () => {
  it('categorizes exact package match', () => {
    const usage = makeUsage('Button', makeImport('@tui/components'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: true, packageName: '@tui/components' }));
    expect(result.category).toBe('design-system');
    expect(result.dsName).toBe('TUI');
  });

  it('categorizes wildcard subpackage match (beaver-ui/*)', () => {
    const usage = makeUsage('Table', makeImport('beaver-ui/table'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: true, packageName: 'beaver-ui' }));
    expect(result.category).toBe('design-system');
    expect(result.dsName).toBe('Beaver');
  });

  it('categorizes namespace member expression to correct DS', () => {
    const usage = makeUsage('DS.Button', makeImport('@tui/components', 'namespace'));
    usage.localName = 'DS';
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: true, packageName: '@tui/components' }));
    expect(result.category).toBe('design-system');
    expect(result.dsName).toBe('TUI');
  });

  it('uses first matching DS when multiple could match', () => {
    const config = makeConfig({
      designSystems: [
        { name: 'First', packages: ['shared-pkg'] },
        { name: 'Second', packages: ['shared-pkg'] },
      ],
    });
    const usage = makeUsage('Comp', makeImport('shared-pkg'));
    const result = categorizeUsage(usage, config, makeResolver({ isNodeModule: true, packageName: 'shared-pkg' }));
    expect(result.dsName).toBe('First');
  });
});

// ── local-library ─────────────────────────────────────────────────────────────

describe('categorizer — local-library', () => {
  it('categorizes import matching localLibraryPatterns by source', () => {
    const usage = makeUsage('SharedHeader', makeImport('@shared/components'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: true, packageName: '@shared/components' }));
    expect(result.category).toBe('local-library');
    expect(result.dsName).toBeNull();
  });

  it('categorizes import matching localLibraryPatterns subpath', () => {
    const usage = makeUsage('SharedBtn', makeImport('@shared/components/Button'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: true, packageName: '@shared/components' }));
    expect(result.category).toBe('local-library');
  });

  it('categorizes by resolvedPath when source does not match', () => {
    const usage = makeUsage('Layout', makeImport('./layout'));
    const result = categorizeUsage(
      usage,
      makeConfig(),
      makeResolver({ resolvedPath: '/repo/src/shared/ui/Layout.tsx', isNodeModule: false })
    );
    expect(result.category).toBe('local-library');
  });
});

// ── third-party ───────────────────────────────────────────────────────────────

describe('categorizer — third-party', () => {
  it('categorizes non-DS npm package as third-party', () => {
    const usage = makeUsage('Select', makeImport('react-select'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: true, packageName: 'react-select' }));
    expect(result.category).toBe('third-party');
    expect(result.packageName).toBe('react-select');
  });

  it('categorizes scoped non-DS package as third-party', () => {
    const usage = makeUsage('DatePicker', makeImport('@mui/x-date-pickers'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: true, packageName: '@mui/x-date-pickers' }));
    expect(result.category).toBe('third-party');
  });
});

// ── local (fallback) ──────────────────────────────────────────────────────────

describe('categorizer — local (fallback)', () => {
  it('categorizes relative import as local', () => {
    const usage = makeUsage('CustomCard', makeImport('./components/CustomCard'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: false, resolvedPath: '/repo/src/components/CustomCard.tsx' }));
    expect(result.category).toBe('local');
    expect(result.resolvedPath).toBe('/repo/src/components/CustomCard.tsx');
  });

  it('categorizes unresolvable import as local', () => {
    const usage = makeUsage('Mystery', makeImport('./mystery'));
    const result = categorizeUsage(usage, makeConfig(), makeResolver({ isNodeModule: false, resolvedPath: null }));
    expect(result.category).toBe('local');
  });
});

// ── findDesignSystem ──────────────────────────────────────────────────────────

describe('findDesignSystem', () => {
  const config = makeConfig();

  it('returns DS name for exact package match', () => {
    expect(findDesignSystem('@tui/components', config)).toBe('TUI');
    expect(findDesignSystem('@tui/icons', config)).toBe('TUI');
    expect(findDesignSystem('beaver-ui', config)).toBe('Beaver');
  });

  it('returns DS name for wildcard subpath', () => {
    expect(findDesignSystem('beaver-ui/table', config)).toBe('Beaver');
    expect(findDesignSystem('beaver-ui/button/index', config)).toBe('Beaver');
  });

  it('returns null for non-DS package', () => {
    expect(findDesignSystem('react-select', config)).toBeNull();
    expect(findDesignSystem('@mui/material', config)).toBeNull();
    expect(findDesignSystem('@shared/components', config)).toBeNull();
  });

  it('returns null for empty designSystems', () => {
    const cfg = makeConfig({ designSystems: [] });
    expect(findDesignSystem('@tui/components', cfg)).toBeNull();
  });
});
