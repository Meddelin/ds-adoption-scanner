import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ThinWrapperHeuristic,
  DataComponentHeuristic,
  LayoutWrapperHeuristic,
} from '../../src/classification/neither-heuristics.js';
import { clearComponentSourceAnalysisCache } from '../../src/classification/source-analysis.js';
import type { CategorizedUsage } from '../../src/types.js';
import type { ClassificationContext } from '../../src/classification/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const tempDirs: string[] = [];

afterEach(() => {
  clearComponentSourceAnalysisCache();
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-neither-'));
  tempDirs.push(dir);
  return dir;
}

function makeUsage(componentName: string, resolvedPath: string): CategorizedUsage {
  return {
    componentName,
    localName: componentName,
    importEntry: {
      localName: componentName,
      importedName: componentName,
      source: `./${componentName}`,
      type: 'named',
    },
    filePath: resolvedPath.replace(/\.tsx$/, '-consumer.tsx'),
    line: 1,
    column: 1,
    props: [],
    hasSpreadProps: false,
    category: 'local',
    dsName: null,
    packageName: null,
    resolvedPath,
  };
}

function makeContext(): ClassificationContext {
  return {
    repoPath: os.tmpdir(),
    designSystems: [],
    localLibraryPatterns: [],
    thresholds: {
      reusableFileThreshold: 2,
      shadowFileThreshold: 2,
      shadowRouteThreshold: 2,
      substantialMarkupThreshold: 5,
    },
    features: { shadowDetection: true, neitherDetection: true },
    thirdPartyWithoutDSBucket: 'neither',
  };
}

// ── ThinWrapperHeuristic ───────────────────────────────────────────────────────

describe('ThinWrapperHeuristic', () => {
  const heuristic = new ThinWrapperHeuristic();
  const ctx = makeContext();

  it('detects renders-only-children via AST', () => {
    const dir = makeTempDir();
    const p = path.join(dir, 'Shell.tsx');
    fs.writeFileSync(
      p,
      `export function Shell({ children }: { children: React.ReactNode }) {
  return <div className="shell">{children}</div>;
}`,
      'utf-8'
    );

    expect(heuristic.check('Shell', [makeUsage('Shell', p)], ctx)).toBe(true);
  });

  it('detects spread-props thin wrapper via AST', () => {
    const dir = makeTempDir();
    const p = path.join(dir, 'Forwarded.tsx');
    fs.writeFileSync(
      p,
      `export function Forwarded(props: any) {
  return <input {...props} />;
}`,
      'utf-8'
    );

    expect(heuristic.check('Forwarded', [makeUsage('Forwarded', p)], ctx)).toBe(true);
  });

  it('does NOT flag a rich component as thin wrapper', () => {
    const dir = makeTempDir();
    const p = path.join(dir, 'Card.tsx');
    fs.writeFileSync(
      p,
      `export function Card({ title, body }: any) {
  return (
    <div className="card">
      <header><h2>{title}</h2></header>
      <section><p>{body}</p></section>
      <footer><button>Action</button></footer>
    </div>
  );
}`,
      'utf-8'
    );

    expect(heuristic.check('Card', [makeUsage('Card', p)], ctx)).toBe(false);
  });

  it('falls back to name heuristic when source is unavailable', () => {
    const usages = [makeUsage('SomeWrapper', '/no/such/file.tsx')];
    expect(heuristic.check('SomeWrapper', usages, ctx)).toBe(true);
    expect(heuristic.check('RealComponent', usages, ctx)).toBe(false);
  });
});

// ── DataComponentHeuristic ────────────────────────────────────────────────────

describe('DataComponentHeuristic', () => {
  const heuristic = new DataComponentHeuristic();
  const ctx = makeContext();

  it('confirms data component via name + low JSX count', () => {
    const dir = makeTempDir();
    const p = path.join(dir, 'UserQuery.tsx');
    fs.writeFileSync(
      p,
      `export function UserQuery({ children }: any) {
  return <>{children}</>;
}`,
      'utf-8'
    );

    expect(heuristic.check('UserQuery', [makeUsage('UserQuery', p)], ctx)).toBe(true);
  });

  it('rejects data-named component that actually renders significant JSX', () => {
    const dir = makeTempDir();
    const p = path.join(dir, 'DataFetcher.tsx');
    fs.writeFileSync(
      p,
      `export function DataFetcher() {
  return (
    <div>
      <header><h1>Title</h1></header>
      <section><p>Content</p></section>
    </div>
  );
}`,
      'utf-8'
    );

    // 5 JSX elements > maxJsxElements (2) → NOT a data component
    expect(heuristic.check('DataFetcher', [makeUsage('DataFetcher', p)], ctx)).toBe(false);
  });

  it('does NOT match non-data component names', () => {
    const usages = [makeUsage('Button', '/no/such/file.tsx')];
    expect(heuristic.check('Button', usages, ctx)).toBe(false);
  });
});

// ── LayoutWrapperHeuristic ────────────────────────────────────────────────────

describe('LayoutWrapperHeuristic', () => {
  const heuristic = new LayoutWrapperHeuristic();
  const ctx = makeContext();

  it('confirms layout wrapper via name + shallow AST depth', () => {
    const dir = makeTempDir();
    const p = path.join(dir, 'PageLayout.tsx');
    fs.writeFileSync(
      p,
      `export function PageLayout({ children }: any) {
  return <main className="page-layout">{children}</main>;
}`,
      'utf-8'
    );

    expect(heuristic.check('PageLayout', [makeUsage('PageLayout', p)], ctx)).toBe(true);
  });

  it('rejects layout-named component with deep JSX tree', () => {
    const dir = makeTempDir();
    const p = path.join(dir, 'DashboardLayout.tsx');
    // Create a deep enough tree: depth 4
    fs.writeFileSync(
      p,
      `export function DashboardLayout() {
  return (
    <div>
      <div>
        <div>
          <div>{/* content */}</div>
        </div>
      </div>
    </div>
  );
}`,
      'utf-8'
    );

    expect(heuristic.check('DashboardLayout', [makeUsage('DashboardLayout', p)], ctx)).toBe(false);
  });

  it('falls back to name pattern when source is unavailable', () => {
    const usages = [makeUsage('AppTemplate', '/no/such/file.tsx')];
    expect(heuristic.check('AppTemplate', usages, ctx)).toBe(true);
  });
});
