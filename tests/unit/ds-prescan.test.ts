import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildFamilyCatalog, buildFamilyLookup, preScanDesignSystems } from '../../src/scanner/ds-prescan.js';
import type { ResolvedConfig } from '../../src/config/schema.js';
import type { DSCatalog } from '../../src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    repositories: [],
    designSystems: [{ name: 'MyDS', packages: ['@myds/ui'] }],
    include: ['**/*.tsx', '**/*.ts'],
    exclude: [],
    localLibraryPatterns: [],
    trackedThirdParty: [],
    tsconfig: 'tsconfig.json',
    output: { format: 'table', verbose: false },
    thresholds: {},
    historyDir: os.tmpdir(),
    transitiveRules: [],
    transitiveAdoption: { enabled: false },
    libraries: [],
    excludeLocalFromAdoption: false,
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-scanner-ds-prescan-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(relPath: string, content: string): string {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

// ─── buildFamilyCatalog — directory-based grouping ────────────────────────────

describe('buildFamilyCatalog — groupBy directory', () => {
  const config = makeConfig();

  it('groups components in same directory into one family', () => {
    write('components/Button/Button.tsx', 'export function Button() {}');
    write('components/Button/ButtonGroup.tsx', 'export function ButtonGroup() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    const button = families.find(f => f.name === 'Button');
    expect(button).toBeDefined();
    expect(button!.components.sort()).toEqual(['Button', 'ButtonGroup']);
  });

  it('creates separate families for different directories', () => {
    write('components/Button/Button.tsx', 'export function Button() {}');
    write('components/EmptyState/EmptyState.tsx', 'export function EmptyState() {}');
    write('components/EmptyState/EmptyStateError.tsx', 'export function EmptyStateError() {}');
    write('components/EmptyState/EmptyStateNotFound.tsx', 'export function EmptyStateNotFound() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    expect(families.length).toBe(2);
    const emptyState = families.find(f => f.name === 'EmptyState');
    expect(emptyState!.components.sort()).toEqual(['EmptyState', 'EmptyStateError', 'EmptyStateNotFound']);
  });

  it('uses component name as family for files at DS root', () => {
    write('Modal.tsx', 'export function Modal() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    const modal = families.find(f => f.name === 'Modal');
    expect(modal).toBeDefined();
    expect(modal!.components).toEqual(['Modal']);
  });

  it('uses component name for files in generic container dirs (src, components)', () => {
    write('src/Button.tsx', 'export function Button() {}');
    write('components/Modal.tsx', 'export function Modal() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    expect(families.find(f => f.name === 'Button')).toBeDefined();
    expect(families.find(f => f.name === 'Modal')).toBeDefined();
    // Should NOT create a family named 'src' or 'components'
    expect(families.find(f => f.name === 'src')).toBeUndefined();
    expect(families.find(f => f.name === 'components')).toBeUndefined();
  });

  it('groups sub-components with their own folders into the parent family', () => {
    // EmptyState is the family; EmptyStateButton and EmptyStateNoData are
    // sub-components each living in their own subdirectory with helpers.
    write('EmptyState/EmptyState.tsx', 'export function EmptyState() {}');
    write('EmptyState/EmptyStateButton/EmptyStateButton.tsx', 'export function EmptyStateButton() {}');
    write('EmptyState/EmptyStateButton/EmptyStateButtonIcon.tsx', 'export function EmptyStateButtonIcon() {}');
    write('EmptyState/EmptyStateNoData/EmptyStateNoData.tsx', 'export function EmptyStateNoData() {}');
    write('EmptyState/EmptyStateNoData/EmptyStateNoDataHelper.tsx', 'export function EmptyStateNoDataHelper() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    expect(families.length).toBe(1);
    const f = families[0];
    expect(f.name).toBe('EmptyState');
    expect(f.components.sort()).toEqual([
      'EmptyState',
      'EmptyStateButton',
      'EmptyStateButtonIcon',
      'EmptyStateNoData',
      'EmptyStateNoDataHelper',
    ]);
  });

  it('groups sub-components under src/ into the parent family', () => {
    // EmptyState/src/ variant — same result as without src/
    write('EmptyState/src/EmptyStateButton.tsx', 'export function EmptyStateButton() {}');
    write('EmptyState/src/EmptyStateNoData.tsx', 'export function EmptyStateNoData() {}');
    write('EmptyState/EmptyState.tsx', 'export function EmptyState() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    expect(families.length).toBe(1);
    expect(families[0].name).toBe('EmptyState');
    expect(families[0].components.sort()).toEqual(['EmptyState', 'EmptyStateButton', 'EmptyStateNoData']);
  });

  it('skips leading generic dirs then takes first non-generic segment', () => {
    // src/components/Button/ButtonGroup.tsx → family "Button"
    write('src/components/Button/Button.tsx', 'export function Button() {}');
    write('src/components/Button/ButtonGroup.tsx', 'export function ButtonGroup() {}');
    write('src/components/EmptyState/EmptyStateButton/EmptyStateButton.tsx', 'export function EmptyStateButton() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    const button = families.find(f => f.name === 'Button');
    expect(button).toBeDefined();
    expect(button!.components.sort()).toEqual(['Button', 'ButtonGroup']);

    const emptyState = families.find(f => f.name === 'EmptyState');
    expect(emptyState).toBeDefined();
    expect(emptyState!.components).toEqual(['EmptyStateButton']);
  });

  it('ignores non-PascalCase exports (utilities, hooks, constants)', () => {
    write('components/utils.ts', 'export function formatDate() {} export const MAX_VALUE = 100;');
    write('components/useHook.ts', 'export function useHook() {}');
    write('components/Button/Button.tsx', 'export function Button() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    // Only Button should be found
    expect(families.length).toBe(1);
    expect(families[0].name).toBe('Button');
  });

  it('excludes barrel re-exports from family assignment', () => {
    write('components/Button/Button.tsx', 'export function Button() {}');
    write('components/Button/ButtonGroup.tsx', 'export function ButtonGroup() {}');
    write('components/Button/index.ts', `
      export { Button } from './Button.js';
      export { ButtonGroup } from './ButtonGroup.js';
    `);
    write('index.ts', `export * from './components/Button/index.js'`);

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    // index.ts files should not create separate families
    const indexFamily = families.find(f => f.name === 'index');
    expect(indexFamily).toBeUndefined();

    const button = families.find(f => f.name === 'Button');
    expect(button).toBeDefined();
    expect(button!.components.sort()).toEqual(['Button', 'ButtonGroup']);
  });

  it('returns empty array for empty directory', () => {
    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);
    expect(families).toEqual([]);
  });

  it('includes source file paths in family', () => {
    write('components/Button/Button.tsx', 'export function Button() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    const button = families.find(f => f.name === 'Button')!;
    expect(button.files.length).toBe(1);
    expect(button.files[0]).toContain('Button.tsx');
  });
});

// ─── buildFamilyCatalog — groupBy none ────────────────────────────────────────

describe('buildFamilyCatalog — groupBy none', () => {
  const config = makeConfig();

  it('treats each component as its own family', () => {
    write('components/Button/Button.tsx', 'export function Button() {}');
    write('components/Button/ButtonGroup.tsx', 'export function ButtonGroup() {}');

    const ds = { name: 'MyDS', packages: ['@myds/ui'], path: tmpDir, groupBy: 'none' as const };
    const families = buildFamilyCatalog(tmpDir, ds, config);

    expect(families.length).toBe(2);
    expect(families.find(f => f.name === 'Button')?.components).toEqual(['Button']);
    expect(families.find(f => f.name === 'ButtonGroup')?.components).toEqual(['ButtonGroup']);
  });
});

// ─── buildFamilyLookup ────────────────────────────────────────────────────────

describe('buildFamilyLookup', () => {
  it('maps each component name to its family name', () => {
    const catalog: DSCatalog = new Map([
      ['MyDS', [
        { name: 'Button', components: ['Button', 'ButtonGroup'], files: [] },
        { name: 'EmptyState', components: ['EmptyState', 'EmptyStateError', 'EmptyStateNotFound'], files: [] },
      ]],
    ]);

    const lookup = buildFamilyLookup(catalog);
    const myDSLookup = lookup.get('MyDS')!;

    expect(myDSLookup.get('Button')).toBe('Button');
    expect(myDSLookup.get('ButtonGroup')).toBe('Button');
    expect(myDSLookup.get('EmptyState')).toBe('EmptyState');
    expect(myDSLookup.get('EmptyStateError')).toBe('EmptyState');
    expect(myDSLookup.get('EmptyStateNotFound')).toBe('EmptyState');
  });

  it('returns empty map for empty catalog', () => {
    const catalog: DSCatalog = new Map();
    const lookup = buildFamilyLookup(catalog);
    expect(lookup.size).toBe(0);
  });

  it('handles multiple DS entries independently', () => {
    const catalog: DSCatalog = new Map([
      ['DS1', [{ name: 'Button', components: ['Button'], files: [] }]],
      ['DS2', [{ name: 'Button', components: ['Button'], files: [] }]],
    ]);

    const lookup = buildFamilyLookup(catalog);
    expect(lookup.has('DS1')).toBe(true);
    expect(lookup.has('DS2')).toBe(true);
  });
});

// ─── preScanDesignSystems ─────────────────────────────────────────────────────

describe('preScanDesignSystems', () => {
  it('returns empty catalog when no DS has path/git', async () => {
    const config = makeConfig({
      designSystems: [{ name: 'MyDS', packages: ['@myds/ui'] }], // no path/git
    });
    const catalog = await preScanDesignSystems(config);
    expect(catalog.size).toBe(0);
  });

  it('scans DS source and returns family catalog', async () => {
    write('components/Button/Button.tsx', 'export function Button() {}');
    write('components/Button/ButtonGroup.tsx', 'export function ButtonGroup() {}');
    write('components/EmptyState/EmptyState.tsx', 'export function EmptyState() {}');
    write('components/EmptyState/EmptyStateError.tsx', 'export function EmptyStateError() {}');
    write('Modal.tsx', 'export function Modal() {}');

    const config = makeConfig({
      designSystems: [{ name: 'MyDS', packages: ['@myds/ui'], path: tmpDir }],
    });
    const catalog = await preScanDesignSystems(config);

    expect(catalog.has('MyDS')).toBe(true);
    const families = catalog.get('MyDS')!;

    expect(families.find(f => f.name === 'Button')).toBeDefined();
    expect(families.find(f => f.name === 'EmptyState')).toBeDefined();
    expect(families.find(f => f.name === 'Modal')).toBeDefined();
  });

  it('warns and skips DS with non-existent path', async () => {
    const config = makeConfig({
      designSystems: [{ name: 'MyDS', packages: ['@myds/ui'], path: '/does/not/exist' }],
    });
    const catalog = await preScanDesignSystems(config);
    expect(catalog.size).toBe(0);
  });

  it('handles multiple DS entries independently', async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ds2-'));
    try {
      write('components/Button/Button.tsx', 'export function Button() {}');
      fs.writeFileSync(path.join(dir2, 'Icon.tsx'), 'export function Icon() {}');

      const config = makeConfig({
        designSystems: [
          { name: 'DS1', packages: ['@ds1/ui'], path: tmpDir },
          { name: 'DS2', packages: ['@ds2/ui'], path: dir2 },
        ],
      });
      const catalog = await preScanDesignSystems(config);

      expect(catalog.has('DS1')).toBe(true);
      expect(catalog.has('DS2')).toBe(true);
      expect(catalog.get('DS2')!.find(f => f.name === 'Icon')).toBeDefined();
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });
});

// ─── Static fixture test ──────────────────────────────────────────────────────

describe('preScanDesignSystems — static fixture', () => {
  it('produces expected families from ds-source fixture', async () => {
    const fixturePath = path.resolve('tests/fixtures/ds-source');
    if (!fs.existsSync(fixturePath)) return; // skip if fixture not present

    const config = makeConfig({
      designSystems: [{ name: 'MyDS', packages: ['@myds/ui'], path: fixturePath }],
    });
    const catalog = await preScanDesignSystems(config);
    const families = catalog.get('MyDS');
    expect(families).toBeDefined();

    const button = families!.find(f => f.name === 'Button');
    expect(button).toBeDefined();
    expect(button!.components.sort()).toEqual(['Button', 'ButtonGroup']);

    const emptyState = families!.find(f => f.name === 'EmptyState');
    expect(emptyState).toBeDefined();
    expect(emptyState!.components.sort()).toEqual([
      'EmptyState', 'EmptyStateButton', 'EmptyStateButtonIcon', 'EmptyStateError', 'EmptyStateNotFound',
    ]);

    const modal = families!.find(f => f.name === 'Modal');
    expect(modal).toBeDefined();
    expect(modal!.components).toEqual(['Modal']);

    // Total: 3 families, 8 components (EmptyState has 5 incl. nested sub-folder components)
    expect(families!.length).toBe(3);
    const totalComponents = families!.reduce((s, f) => s + f.components.length, 0);
    expect(totalComponents).toBe(8);
  });
});
