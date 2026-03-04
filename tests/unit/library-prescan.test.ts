import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFileExports, preScanLibraries } from '../../src/scanner/library-prescan.js';
import type { ResolvedConfig } from '../../src/config/schema.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    repositories: [],
    designSystems: [{ name: 'Beaver', packages: ['@beaver/ui'] }],
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-scanner-prescan-'));
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

// ─── parseFileExports unit tests ──────────────────────────────────────────────

describe('parseFileExports — DS import detection', () => {
  const config = makeConfig();

  it('detects direct DS import', () => {
    const code = `import { Button } from '@beaver/ui'; export function MyButton() {}`;
    const p = write('Button.tsx', code);
    const info = parseFileExports(code, p, config);
    expect(info.hasDSImport).toBe(true);
    expect(info.dsName).toBe('Beaver');
  });

  it('returns false for non-DS import', () => {
    const code = `import { something } from 'lodash'; export function Util() {}`;
    const p = write('Util.tsx', code);
    const info = parseFileExports(code, p, config);
    expect(info.hasDSImport).toBe(false);
    expect(info.dsName).toBeNull();
  });

  it('does NOT treat inter-library imports as DS', () => {
    // @company/shared-ui is NOT in designSystems[], so this should not be DS-backed
    const code = `import { SharedBtn } from '@company/shared-ui'; export function Wrapper() {}`;
    const p = write('Wrapper.tsx', code);
    const info = parseFileExports(code, p, config);
    expect(info.hasDSImport).toBe(false);
  });
});

describe('parseFileExports — export extraction', () => {
  const config = makeConfig();

  it('extracts named function export', () => {
    const code = `export function MyComponent() { return null; }`;
    const p = write('a.tsx', code);
    const info = parseFileExports(code, p, config);
    expect(info.defined.has('MyComponent')).toBe(true);
    expect(info.reExports).toHaveLength(0);
  });

  it('extracts named const export', () => {
    const code = `export const Button = () => null;`;
    const p = write('b.tsx', code);
    const info = parseFileExports(code, p, config);
    expect(info.defined.has('Button')).toBe(true);
  });

  it('extracts named class export', () => {
    const code = `export class MyClass {}`;
    const p = write('c.ts', code);
    const info = parseFileExports(code, p, config);
    expect(info.defined.has('MyClass')).toBe(true);
  });

  it('extracts export default', () => {
    const code = `export default function Main() {}`;
    const p = write('d.tsx', code);
    const info = parseFileExports(code, p, config);
    expect(info.defined.has('default')).toBe(true);
  });

  it('extracts named export specifiers (no source)', () => {
    const code = `const A = () => null; const B = () => null; export { A, B };`;
    const p = write('e.tsx', code);
    const info = parseFileExports(code, p, config);
    expect(info.defined.has('A')).toBe(true);
    expect(info.defined.has('B')).toBe(true);
  });

  it('extracts re-exports with source', () => {
    const code = `export { Button, Input } from './components';`;
    const p = write('f.ts', code);
    const info = parseFileExports(code, p, config);
    expect(info.reExports).toContainEqual({ name: 'Button', from: './components' });
    expect(info.reExports).toContainEqual({ name: 'Input', from: './components' });
  });

  it('extracts star re-export', () => {
    const code = `export * from './widgets';`;
    const p = write('g.ts', code);
    const info = parseFileExports(code, p, config);
    expect(info.reExports).toContainEqual({ name: '*', from: './widgets' });
  });

  it('treats imported-then-re-exported name as reExport not defined', () => {
    // "import { Btn } from './btn'; export { Btn as Button }" — Btn is imported,
    // so Button is a re-export, NOT a local definition.
    const code = `import { Btn } from './btn'; export { Btn as Button };`;
    const p = write('h.ts', code);
    const info = parseFileExports(code, p, config);
    expect(info.defined.has('Button')).toBe(false);
    expect(info.reExports).toContainEqual({ name: 'Button', from: './btn' });
  });

  it('treats locally-defined export specifier (no import) as defined', () => {
    // "const X = ...; export { X }" — X is locally defined
    const code = `const MyComp = () => null; export { MyComp };`;
    const p = write('i.ts', code);
    const info = parseFileExports(code, p, config);
    expect(info.defined.has('MyComp')).toBe(true);
    expect(info.reExports).toHaveLength(0);
  });
});

// ─── preScanLibraries integration tests ───────────────────────────────────────

describe('preScanLibraries — component map building', () => {
  it('marks DS-backed components as true', async () => {
    // DSButton.tsx imports from DS and exports a component
    write('src/DSButton.tsx', `
      import { Button } from '@beaver/ui';
      export function DSButton() { return null; }
    `);
    // CustomWidget.tsx does NOT import DS
    write('src/CustomWidget.tsx', `
      export function CustomWidget() { return null; }
    `);

    const config = makeConfig({
      libraries: [{
        package: '@company/ui',
        backedBy: 'Beaver',
        path: tmpDir,
      }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const entry = registry.get('@company/ui');
    expect(entry).toBeDefined();
    expect(entry!.backedBy).toBe('Beaver');
    expect(entry!.componentMap.get('DSButton')?.isDSBacked).toBe(true);
    expect(entry!.componentMap.get('CustomWidget')?.isDSBacked).toBe(false);
  });

  it('resolves barrel re-exports correctly', async () => {
    // Actual implementation file uses DS
    write('src/ProTable.tsx', `
      import { Table } from '@beaver/ui';
      export function ProTable() { return null; }
    `);
    // Pure utility — no DS
    write('src/utils.tsx', `
      export function formatDate() { return ''; }
    `);
    // Barrel file re-exports both
    write('src/index.ts', `
      export { ProTable } from './ProTable';
      export { formatDate } from './utils';
    `);

    const config = makeConfig({
      libraries: [{
        package: '@pro/components',
        backedBy: 'Beaver',
        path: tmpDir,
      }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const map = registry.get('@pro/components')!.componentMap;

    // ProTable is backed (imported through barrel)
    expect(map.get('ProTable')?.isDSBacked).toBe(true);
    // formatDate is a camelCase utility — not tracked (only PascalCase components are)
    expect(map.get('formatDate')).toBeUndefined();
  });

  it('resolves barrel re-export of default-exported component', async () => {
    // Pattern: export default function Foo(){} + barrel: export { default as Foo } from './Foo'
    // Bug: only 'default' was added to info.defined, so componentToFile had no entry for 'Foo'
    // → familyName fell back to component name → 1 family per component instead of per directory
    write('src/confirm-modal/ConfirmModal.tsx', `
      import { Button } from '@beaver/ui';
      export default function ConfirmModal() { return null; }
    `);
    write('src/confirm-modal/index.ts', `
      export { default as ConfirmModal } from './ConfirmModal';
    `);

    const config = makeConfig({
      libraries: [{ package: '@company/ui', backedBy: 'Beaver', path: tmpDir }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const { componentMap, familyMap } = registry.get('@company/ui')!;

    // Component is still tracked and DS-backed
    expect(componentMap.get('ConfirmModal')?.isDSBacked).toBe(true);
    // Family should be directory name, NOT the component name
    expect(familyMap.has('confirm-modal')).toBe(true);
    expect(familyMap.has('ConfirmModal')).toBe(false);
  });

  it('handles star re-export (export * from)', async () => {
    write('src/Button.tsx', `
      import { Btn } from '@beaver/ui';
      export function Button() { return null; }
    `);
    write('src/index.ts', `export * from './Button';`);

    const config = makeConfig({
      libraries: [{
        package: '@lib/ui',
        backedBy: 'Beaver',
        path: tmpDir,
      }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const map = registry.get('@lib/ui')!.componentMap;
    expect(map.get('Button')?.isDSBacked).toBe(true);
  });

  it('returns empty registry when no libraries have path/git', async () => {
    const config = makeConfig({ libraries: [] });
    const registry = await preScanLibraries(config, new Map(), false);
    expect(registry.size).toBe(0);
  });

  it('warns and continues if library path does not exist', async () => {
    const config = makeConfig({
      libraries: [{
        package: '@missing/lib',
        backedBy: 'Beaver',
        path: '/non/existent/path',
      }],
    });
    const registry = await preScanLibraries(config, new Map(), false);
    expect(registry.size).toBe(0);
  });

  it('does not propagate inter-library DS backing', async () => {
    // lib-b imports from lib-a (another library), NOT from DS directly
    write('src/WrappedComponent.tsx', `
      import { Something } from '@another/library';
      export function WrappedComponent() { return null; }
    `);

    const config = makeConfig({
      libraries: [{
        package: '@company/lib-b',
        backedBy: 'Beaver',
        path: tmpDir,
      }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const map = registry.get('@company/lib-b')!.componentMap;
    // @another/library is NOT a DS package, so WrappedComponent should be false
    expect(map.get('WrappedComponent')?.isDSBacked).toBe(false);
  });

  it('sets dsFamily on component entry when DSCatalog maps the DS component to a family', async () => {
    // ProjectButton wraps Beaver's Button — which belongs to the "Button" family in the catalog
    write('src/ProjectButton.tsx', `
      import { Button } from '@beaver/ui';
      export function ProjectButton() { return null; }
    `);

    const config = makeConfig({
      libraries: [{
        package: '@company/ui',
        backedBy: 'Beaver',
        path: tmpDir,
      }],
    });

    const dsCatalog = new Map([
      ['Beaver', [
        { name: 'Button', components: ['Button', 'ButtonGroup'], files: [] },
        { name: 'Modal',  components: ['Modal'],                 files: [] },
      ]],
    ]);

    const registry = await preScanLibraries(config, dsCatalog, false);
    const entry = registry.get('@company/ui')!.componentMap.get('ProjectButton');
    expect(entry?.isDSBacked).toBe(true);
    expect(entry?.dsFamily).toBe('Button');
  });

  it('leaves dsFamily undefined when DSCatalog has no family info for DS', async () => {
    write('src/ProjectModal.tsx', `
      import { Modal } from '@beaver/ui';
      export function ProjectModal() { return null; }
    `);

    const config = makeConfig({
      libraries: [{ package: '@company/ui', backedBy: 'Beaver', path: tmpDir }],
    });

    // Empty catalog — no family information
    const registry = await preScanLibraries(config, new Map(), false);
    const entry = registry.get('@company/ui')!.componentMap.get('ProjectModal');
    expect(entry?.isDSBacked).toBe(true);
    expect(entry?.dsFamily).toBeUndefined();
  });
});

// ─── familyMap grouping tests ─────────────────────────────────────────────────

describe('preScanLibraries — familyMap grouping', () => {
  it('groups components in the same directory into one family', async () => {
    write('src/confirm-popup/ConfirmPopup.tsx', `
      import { Button } from '@beaver/ui';
      export function ConfirmPopup() { return null; }
    `);
    write('src/confirm-popup/ConfirmPopupHeader.tsx', `
      import { Button } from '@beaver/ui';
      export function ConfirmPopupHeader() { return null; }
    `);
    write('src/empty-state/EmptyState.tsx', `
      export function EmptyState() { return null; }
    `);

    const config = makeConfig({
      libraries: [{ package: '@company/ui', backedBy: 'Beaver', path: tmpDir }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const { familyMap } = registry.get('@company/ui')!;

    // Two components in confirm-popup → one family
    expect(familyMap.has('confirm-popup')).toBe(true);
    expect(familyMap.has('empty-state')).toBe(true);
    // 3 components → 2 families
    expect(familyMap.size).toBe(2);
  });

  it('marks family as DS-backed when any component in it is DS-backed', async () => {
    // DS-backed component in the family
    write('src/confirm-popup/ConfirmPopup.tsx', `
      import { Button } from '@beaver/ui';
      export function ConfirmPopup() { return null; }
    `);
    // Non-DS component in the same family
    write('src/confirm-popup/ConfirmPopupHeader.tsx', `
      export function ConfirmPopupHeader() { return null; }
    `);
    // Fully custom family
    write('src/sidebar/Sidebar.tsx', `
      export function Sidebar() { return null; }
    `);

    const config = makeConfig({
      libraries: [{ package: '@company/ui', backedBy: 'Beaver', path: tmpDir }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const { familyMap } = registry.get('@company/ui')!;

    expect(familyMap.get('confirm-popup')?.isDSBacked).toBe(true);
    expect(familyMap.get('sidebar')?.isDSBacked).toBe(false);
  });

  it('uses componentsDir as grouping base for deep library structures', async () => {
    // Structure: src/components/spirit-ui/{feature}/Comp.tsx
    // Without componentsDir, GENERIC_DIRS skips 'src' and 'components',
    // giving family = 'spirit-ui' (wrong). With componentsDir set, family = feature name.
    write('src/components/spirit-ui/confirm-popup/ConfirmPopup.tsx', `
      import { Button } from '@beaver/ui';
      export function ConfirmPopup() { return null; }
    `);
    write('src/components/spirit-ui/empty-state/EmptyState.tsx', `
      export function EmptyState() { return null; }
    `);

    const config = makeConfig({
      libraries: [{
        package: '@company/ui',
        backedBy: 'Beaver',
        path: tmpDir,
        componentsDir: 'src/components/spirit-ui',
      }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const { familyMap } = registry.get('@company/ui')!;

    expect(familyMap.has('confirm-popup')).toBe(true);
    expect(familyMap.has('empty-state')).toBe(true);
    // Should NOT have 'spirit-ui' as a family name
    expect(familyMap.has('spirit-ui')).toBe(false);
    expect(familyMap.size).toBe(2);
  });

  it('falls back to component name when file is directly in the base dir', async () => {
    // Component directly in root (or in a GENERIC_DIR at root)
    write('src/Button.tsx', `
      import { Btn } from '@beaver/ui';
      export function Button() { return null; }
    `);

    const config = makeConfig({
      libraries: [{ package: '@company/ui', backedBy: 'Beaver', path: tmpDir }],
    });

    const registry = await preScanLibraries(config, new Map(), false);
    const { familyMap } = registry.get('@company/ui')!;

    // File is in 'src' (a GENERIC_DIR) → falls back to component name as family
    expect(familyMap.has('Button')).toBe(true);
    expect(familyMap.get('Button')?.isDSBacked).toBe(true);
  });
});
