import { describe, it, expect } from 'vitest';
import { parseFile } from '../../src/scanner/parser.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const FIXTURES = path.resolve('tests/fixtures');

function tmpFile(content: string, ext = '.tsx'): string {
  const p = path.join(os.tmpdir(), `ds-scanner-test-${Date.now()}${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

function cleanup(p: string) {
  try { fs.unlinkSync(p); } catch {}
}

// ── Import extraction ─────────────────────────────────────────────────────────

describe('parser — import extraction', () => {
  it('extracts named imports', async () => {
    const p = tmpFile(`import { Button, Input } from '@tui/components';`);
    try {
      const result = await parseFile(p);
      expect(result.errors).toHaveLength(0);
      expect(result.imports.get('Button')).toMatchObject({
        localName: 'Button',
        importedName: 'Button',
        source: '@tui/components',
        type: 'named',
      });
      expect(result.imports.get('Input')).toMatchObject({
        localName: 'Input',
        importedName: 'Input',
        source: '@tui/components',
        type: 'named',
      });
    } finally { cleanup(p); }
  });

  it('extracts aliased named import', async () => {
    const p = tmpFile(`import { Button as Btn } from '@tui/components';`);
    try {
      const result = await parseFile(p);
      expect(result.imports.get('Btn')).toMatchObject({
        localName: 'Btn',
        importedName: 'Button',
        source: '@tui/components',
        type: 'named',
      });
    } finally { cleanup(p); }
  });

  it('extracts default import', async () => {
    const p = tmpFile(`import Select from 'react-select';`);
    try {
      const result = await parseFile(p);
      expect(result.imports.get('Select')).toMatchObject({
        localName: 'Select',
        importedName: 'default',
        source: 'react-select',
        type: 'default',
      });
    } finally { cleanup(p); }
  });

  it('extracts namespace import', async () => {
    const p = tmpFile(`import * as DS from '@tui/components';`);
    try {
      const result = await parseFile(p);
      expect(result.imports.get('DS')).toMatchObject({
        localName: 'DS',
        importedName: '*',
        source: '@tui/components',
        type: 'namespace',
      });
    } finally { cleanup(p); }
  });

  it('handles multiple import declarations', async () => {
    const p = tmpFile(`
      import { Button } from '@tui/components';
      import { PageLayout } from 'beaver-ui';
      import React from 'react';
    `);
    try {
      const result = await parseFile(p);
      expect(result.imports.size).toBe(3);
      expect(result.imports.get('Button')?.source).toBe('@tui/components');
      expect(result.imports.get('PageLayout')?.source).toBe('beaver-ui');
    } finally { cleanup(p); }
  });
});

// ── JSX extraction ────────────────────────────────────────────────────────────

describe('parser — JSX extraction', () => {
  it('extracts simple JSX element', async () => {
    const p = tmpFile(`
      import { Button } from '@tui/components';
      const App = () => <Button variant="primary">OK</Button>;
    `);
    try {
      const result = await parseFile(p);
      const btn = result.jsxUsages.find(u => u.componentName === 'Button');
      expect(btn).toBeDefined();
      expect(btn!.importEntry?.source).toBe('@tui/components');
      expect(btn!.props).toContain('variant');
      expect(btn!.line).toBeGreaterThan(0);
    } finally { cleanup(p); }
  });

  it('marks lowercase elements as having no importEntry', async () => {
    const p = tmpFile(`const App = () => <div className="x"><span>text</span></div>;`);
    try {
      const result = await parseFile(p);
      expect(result.jsxUsages.length).toBe(2);
      for (const u of result.jsxUsages) {
        expect(u.importEntry).toBeNull();
      }
    } finally { cleanup(p); }
  });

  it('extracts JSXMemberExpression (namespace usage)', async () => {
    const p = tmpFile(`
      import * as DS from '@tui/components';
      const App = () => <DS.Button variant="primary" />;
    `);
    try {
      const result = await parseFile(p);
      const u = result.jsxUsages.find(u => u.componentName === 'DS.Button');
      expect(u).toBeDefined();
      expect(u!.localName).toBe('DS');
      expect(u!.importEntry?.source).toBe('@tui/components');
      expect(u!.importEntry?.type).toBe('namespace');
    } finally { cleanup(p); }
  });

  it('extracts compound component (Select.Option)', async () => {
    const p = tmpFile(`
      import { Select } from '@tui/components';
      const App = () => (
        <Select>
          <Select.Option value="a">A</Select.Option>
        </Select>
      );
    `);
    try {
      const result = await parseFile(p);
      const option = result.jsxUsages.find(u => u.componentName === 'Select.Option');
      expect(option).toBeDefined();
      expect(option!.localName).toBe('Select');
      expect(option!.importEntry?.source).toBe('@tui/components');
    } finally { cleanup(p); }
  });

  it('detects spread props', async () => {
    const p = tmpFile(`
      import { Button } from '@tui/components';
      const App = ({ onClick, ...rest }) => <Button {...rest} onClick={onClick} />;
    `);
    try {
      const result = await parseFile(p);
      const btn = result.jsxUsages.find(u => u.componentName === 'Button');
      expect(btn!.hasSpreadProps).toBe(true);
      expect(btn!.props).toContain('onClick');
    } finally { cleanup(p); }
  });

  it('skips React.Fragment', async () => {
    const p = tmpFile(`
      import React from 'react';
      const App = () => <React.Fragment><div /></React.Fragment>;
    `);
    try {
      const result = await parseFile(p);
      const frag = result.jsxUsages.find(u => u.componentName === 'React.Fragment');
      expect(frag).toBeUndefined();
    } finally { cleanup(p); }
  });

  it('does not count dynamic imports as JSX usage', async () => {
    const p = tmpFile(`
      import React, { lazy } from 'react';
      const LazyPage = lazy(() => import('./Page'));
      const App = () => <LazyPage />;
    `);
    try {
      const result = await parseFile(p);
      // LazyPage is a local identifier (no importEntry from DS)
      const usage = result.jsxUsages.find(u => u.componentName === 'LazyPage');
      expect(usage).toBeDefined();
      expect(usage!.importEntry).toBeNull(); // not imported directly
    } finally { cleanup(p); }
  });

  it('returns errors for unparseable files without crashing', async () => {
    const p = tmpFile(`const x = <Broken {invalid jsx;`, '.tsx');
    try {
      const result = await parseFile(p);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.jsxUsages).toHaveLength(0);
    } finally { cleanup(p); }
  });

  it('handles file read error gracefully', async () => {
    const result = await parseFile('/nonexistent/path/that/does/not/exist.tsx');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.jsxUsages).toHaveLength(0);
  });
});

// ── Fixture file tests ────────────────────────────────────────────────────────

describe('parser — fixture files', () => {
  it('parses simple-repo App.tsx correctly', async () => {
    const filePath = path.join(FIXTURES, 'simple-repo/src/App.tsx');
    const result = await parseFile(filePath);

    expect(result.errors).toHaveLength(0);
    // Each specifier = one ImportMap entry: Button, Input, PageLayout, SharedLayout, CustomCard, Select
    expect(result.imports.size).toBe(6);

    const componentNames = result.jsxUsages.map(u => u.componentName);
    expect(componentNames).toContain('Button');
    expect(componentNames).toContain('Input');
    expect(componentNames).toContain('PageLayout');
    expect(componentNames).toContain('SharedLayout');
    expect(componentNames).toContain('CustomCard');
    expect(componentNames).toContain('Select');
    expect(componentNames).toContain('div'); // html native
  });

  it('parses namespace-imports App.tsx correctly', async () => {
    const filePath = path.join(FIXTURES, 'namespace-imports/src/App.tsx');
    const result = await parseFile(filePath);

    expect(result.errors).toHaveLength(0);
    const names = result.jsxUsages.map(u => u.componentName);
    expect(names).toContain('DS.Button');
    expect(names).toContain('DS.Input');
    expect(names).toContain('DS.Select.Option');
    expect(names).toContain('Icons.SearchIcon');
  });
});
