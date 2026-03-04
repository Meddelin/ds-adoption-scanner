import { describe, it, expect } from 'vitest';
import { enrichWithFamily } from '../../src/scanner/family-resolver.js';
import type { CategorizedUsage, DSCatalog } from '../../src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUsage(overrides: Partial<CategorizedUsage> = {}): CategorizedUsage {
  // Auto-sync importEntry.importedName with componentName unless explicitly overridden
  const componentName = overrides.componentName ?? 'Button';
  const { importEntry: overrideImportEntry, ...restOverrides } = overrides;
  const importEntry = overrideImportEntry !== undefined
    ? overrideImportEntry
    : { localName: componentName, importedName: componentName, source: '@myds/ui', type: 'named' as const };
  return {
    componentName,
    localName: componentName,
    filePath: '/repo/src/App.tsx',
    line: 1,
    column: 1,
    props: [],
    hasSpreadProps: false,
    category: 'design-system',
    dsName: 'MyDS',
    packageName: '@myds/ui',
    resolvedPath: null,
    ...restOverrides,
    importEntry,
  };
}

function makeCatalog(entries: Record<string, Record<string, string>>): DSCatalog {
  // entries: { dsName: { componentName: familyName } }
  const catalog: DSCatalog = new Map();
  for (const [dsName, components] of Object.entries(entries)) {
    const familyMap = new Map<string, string[]>();
    for (const [comp, family] of Object.entries(components)) {
      const existing = familyMap.get(family) ?? [];
      existing.push(comp);
      familyMap.set(family, existing);
    }
    catalog.set(dsName, Array.from(familyMap.entries()).map(([name, comps]) => ({
      name,
      components: comps,
      files: [],
    })));
  }
  return catalog;
}

// ─── enrichWithFamily ─────────────────────────────────────────────────────────

describe('enrichWithFamily', () => {
  it('returns usages unchanged when catalog is empty', () => {
    const usages = [makeUsage()];
    const result = enrichWithFamily(usages, new Map());
    expect(result).toBe(usages); // same reference — no copy
  });

  it('assigns componentFamily to design-system usages', () => {
    const catalog = makeCatalog({ MyDS: { Button: 'Button', ButtonGroup: 'Button' } });
    const usages = [makeUsage({ componentName: 'Button' })];

    const result = enrichWithFamily(usages, catalog);
    expect(result[0].componentFamily).toBe('Button');
  });

  it('uses importedName (original export) for lookup, not local alias', () => {
    const catalog = makeCatalog({ MyDS: { EmptyStateError: 'EmptyState' } });
    const usage = makeUsage({
      componentName: 'MyError', // local alias
      importEntry: {
        localName: 'MyError',
        importedName: 'EmptyStateError', // original export
        source: '@myds/ui',
        type: 'named',
      },
    });

    const result = enrichWithFamily([usage], catalog);
    expect(result[0].componentFamily).toBe('EmptyState');
  });

  it('does not set componentFamily for non-DS categories', () => {
    const catalog = makeCatalog({ MyDS: { Button: 'Button' } });
    const localUsage = makeUsage({ category: 'local', dsName: null, packageName: null });
    const localLibUsage = makeUsage({ category: 'local-library', dsName: null });
    const thirdParty = makeUsage({ category: 'third-party', dsName: null });
    const html = makeUsage({ category: 'html-native', dsName: null, componentName: 'div' });

    const result = enrichWithFamily([localUsage, localLibUsage, thirdParty, html], catalog);
    for (const u of result) {
      expect(u.componentFamily).toBeUndefined();
    }
  });

  it('does not set componentFamily when DS has no catalog entry', () => {
    const catalog = makeCatalog({ OtherDS: { Button: 'Button' } });
    const usage = makeUsage({ dsName: 'MyDS' }); // MyDS not in catalog

    const result = enrichWithFamily([usage], catalog);
    expect(result[0].componentFamily).toBeUndefined();
  });

  it('does not set componentFamily when component not found in catalog', () => {
    const catalog = makeCatalog({ MyDS: { Button: 'Button' } });
    const usage = makeUsage({ componentName: 'UnknownWidget' });

    const result = enrichWithFamily([usage], catalog);
    expect(result[0].componentFamily).toBeUndefined();
  });

  it('handles compound component lookup via importEntry.importedName', () => {
    const catalog = makeCatalog({ MyDS: { Select: 'Select' } });
    // <Select.Option> — importedName is 'Select', componentName is 'Select.Option'
    const usage = makeUsage({
      componentName: 'Select.Option',
      importEntry: {
        localName: 'Select',
        importedName: 'Select',
        source: '@myds/ui',
        type: 'named',
      },
    });

    const result = enrichWithFamily([usage], catalog);
    expect(result[0].componentFamily).toBe('Select');
  });

  it('falls back to componentName when importEntry is null', () => {
    const catalog = makeCatalog({ MyDS: { Button: 'Button' } });
    const usage = makeUsage({ componentName: 'Button', importEntry: null });

    const result = enrichWithFamily([usage], catalog);
    expect(result[0].componentFamily).toBe('Button');
  });

  it('enriches multiple usages across different families', () => {
    const catalog = makeCatalog({
      MyDS: {
        Button: 'Button',
        ButtonGroup: 'Button',
        EmptyStateError: 'EmptyState',
        EmptyState: 'EmptyState',
      },
    });

    const usages = [
      makeUsage({ componentName: 'Button' }),
      makeUsage({
        componentName: 'ButtonGroup',
        importEntry: { localName: 'ButtonGroup', importedName: 'ButtonGroup', source: '@myds/ui', type: 'named' },
      }),
      makeUsage({
        componentName: 'EmptyStateError',
        importEntry: { localName: 'EmptyStateError', importedName: 'EmptyStateError', source: '@myds/ui', type: 'named' },
      }),
    ];

    const result = enrichWithFamily(usages, catalog);
    expect(result[0].componentFamily).toBe('Button');
    expect(result[1].componentFamily).toBe('Button');
    expect(result[2].componentFamily).toBe('EmptyState');
  });
});
