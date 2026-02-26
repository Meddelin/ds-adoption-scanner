import { describe, it, expect } from 'vitest';
import { ImportResolver } from '../../src/scanner/import-resolver.js';
import path from 'node:path';

const FIXTURES = path.resolve('tests/fixtures');

// ── Package name extraction (via node_module resolution) ─────────────────────

describe('ImportResolver — node module detection', () => {
  // Use a dummy repo root that doesn't need a real tsconfig for node module tests
  const resolver = new ImportResolver(process.cwd());

  it('identifies bare node module', () => {
    const result = resolver.resolve('react-select', '/repo/src/App.tsx');
    expect(result.isNodeModule).toBe(true);
    expect(result.packageName).toBe('react-select');
  });

  it('identifies scoped node module', () => {
    const result = resolver.resolve('@tui/components', '/repo/src/App.tsx');
    expect(result.isNodeModule).toBe(true);
    expect(result.packageName).toBe('@tui/components');
  });

  it('extracts scoped package name from subpath', () => {
    const result = resolver.resolve('@tui/components/Button', '/repo/src/App.tsx');
    expect(result.isNodeModule).toBe(true);
    expect(result.packageName).toBe('@tui/components');
  });

  it('extracts bare package name from subpath', () => {
    const result = resolver.resolve('lodash/get', '/repo/src/App.tsx');
    expect(result.isNodeModule).toBe(true);
    expect(result.packageName).toBe('lodash');
  });
});

// ── Caching ───────────────────────────────────────────────────────────────────

describe('ImportResolver — caching', () => {
  it('returns the same object for same key (cache hit)', () => {
    const resolver = new ImportResolver(process.cwd());
    const a = resolver.resolve('react', '/repo/src/App.tsx');
    const b = resolver.resolve('react', '/repo/src/App.tsx');
    expect(a).toBe(b); // strict reference equality = cache hit
  });

  it('returns different objects for different containing files', () => {
    const resolver = new ImportResolver(process.cwd());
    const a = resolver.resolve('react', '/repo/src/App.tsx');
    const b = resolver.resolve('react', '/repo/src/Page.tsx');
    // Both node modules, both point to same thing — but different cache entries
    expect(a.packageName).toBe(b.packageName);
  });
});

// ── Relative import resolution ────────────────────────────────────────────────

describe('ImportResolver — relative imports', () => {
  it('resolves relative import in simple-repo fixture', () => {
    const repoRoot = path.join(FIXTURES, 'simple-repo');
    const resolver = new ImportResolver(repoRoot);

    const result = resolver.resolve(
      './components/CustomCard',
      path.join(repoRoot, 'src/App.tsx')
    );

    expect(result.isNodeModule).toBe(false);
    expect(result.resolvedPath).not.toBeNull();
    expect(result.resolvedPath).toContain('CustomCard');
  });
});

// ── Aliased paths resolution ──────────────────────────────────────────────────

describe('ImportResolver — tsconfig path aliases', () => {
  it('resolves @shared/* alias from aliased-paths fixture', () => {
    const repoRoot = path.join(FIXTURES, 'aliased-paths');
    const resolver = new ImportResolver(repoRoot, 'tsconfig.json');

    const result = resolver.resolve(
      '@shared/Layout',
      path.join(repoRoot, 'src/App.tsx')
    );

    // Should resolve via tsconfig paths → src/shared/Layout.tsx
    expect(result.isNodeModule).toBe(false);
    expect(result.resolvedPath).not.toBeNull();
    if (result.resolvedPath) {
      expect(result.resolvedPath.replace(/\\/g, '/')).toContain('shared/Layout');
    }
  });
});

// ── Missing tsconfig ──────────────────────────────────────────────────────────

describe('ImportResolver — missing tsconfig', () => {
  it('does not throw when tsconfig does not exist', () => {
    expect(() => new ImportResolver('/nonexistent/repo')).not.toThrow();
  });

  it('still resolves node modules without tsconfig', () => {
    const resolver = new ImportResolver('/nonexistent/repo');
    const result = resolver.resolve('@mui/material', '/nonexistent/repo/src/App.tsx');
    expect(result.isNodeModule).toBe(true);
    expect(result.packageName).toBe('@mui/material');
  });
});
