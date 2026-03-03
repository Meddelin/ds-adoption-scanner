import { describe, it, expect } from 'vitest';
import { buildLocalReuseAnalysis } from '../../src/metrics/aggregator.js';
import type { RepoScanData } from '../../src/metrics/aggregator.js';
import type { CategorizedUsage } from '../../src/types.js';

function makeUsage(
  componentName: string,
  filePath: string,
  resolvedPath: string | null = null,
  category: CategorizedUsage['category'] = 'local'
): CategorizedUsage {
  return {
    componentName,
    localName: componentName,
    importEntry: resolvedPath ? {
      localName: componentName,
      importedName: componentName,
      source: './SomeFile',
      type: 'named',
    } : null,
    filePath,
    line: 1,
    column: 0,
    props: [],
    hasSpreadProps: false,
    category,
    dsName: null,
    packageName: null,
    resolvedPath,
  };
}

function makeRepo(name: string, usages: CategorizedUsage[]): RepoScanData {
  return {
    repositoryName: name,
    repositoryPath: `/repos/${name}`,
    usages,
    filesScanned: 5,
  };
}

describe('buildLocalReuseAnalysis', () => {
  it('returns empty report when no local components', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        makeUsage('Button', '/repo/file.tsx', null, 'design-system'),
      ]),
    ]);
    expect(result.totalTracked).toBe(0);
    expect(result.inlineCount).toBe(0);
    expect(result.singletonCount).toBe(0);
    expect(result.localReuseCount).toBe(0);
    expect(result.crossRepoCount).toBe(0);
    expect(result.topCandidates).toHaveLength(0);
  });

  it('counts inline (resolvedPath=null) as inlineCount, not tracked', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        makeUsage('InlineComp', '/repo/file.tsx', null, 'local'),
        makeUsage('InlineComp2', '/repo/other.tsx', null, 'local'),
      ]),
    ]);
    expect(result.inlineCount).toBe(2);
    expect(result.totalTracked).toBe(0);
    expect(result.singletonCount).toBe(0);
  });

  it('classifies component used in 1 file as singleton', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        makeUsage('Card', '/repo/file.tsx', '/repo/src/Card.tsx', 'local'),
      ]),
    ]);
    expect(result.totalTracked).toBe(1);
    expect(result.singletonCount).toBe(1);
    expect(result.localReuseCount).toBe(0);
    expect(result.crossRepoCount).toBe(0);
  });

  it('classifies component used in 2+ files within 1 repo as localReuse', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        makeUsage('FormField', '/repo/src/pages/Page1.tsx', '/repo/src/FormField.tsx', 'local'),
        makeUsage('FormField', '/repo/src/pages/Page2.tsx', '/repo/src/FormField.tsx', 'local'),
        makeUsage('FormField', '/repo/src/pages/Page3.tsx', '/repo/src/FormField.tsx', 'local'),
      ]),
    ]);
    expect(result.totalTracked).toBe(1);
    expect(result.singletonCount).toBe(0);
    expect(result.localReuseCount).toBe(1);
    expect(result.crossRepoCount).toBe(0);
    expect(result.topCandidates).toHaveLength(1);
    expect(result.topCandidates[0]!.filesUsedIn).toBe(3);
    expect(result.topCandidates[0]!.reposUsedIn).toBe(1);
    expect(result.topCandidates[0]!.instances).toBe(3);
  });

  it('classifies component used in 2+ repos as crossRepo', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        makeUsage('DataTable', '/repoA/src/Page.tsx', '/shared/DataTable.tsx', 'local'),
      ]),
      makeRepo('repo-b', [
        makeUsage('DataTable', '/repoB/src/Page.tsx', '/shared/DataTable.tsx', 'local'),
      ]),
    ]);
    expect(result.totalTracked).toBe(1);
    expect(result.singletonCount).toBe(0);
    expect(result.localReuseCount).toBe(0);
    expect(result.crossRepoCount).toBe(1);
    expect(result.topCandidates[0]!.reposUsedIn).toBe(2);
  });

  it('handles mix of singleton, local-reuse, and cross-repo', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        // singleton
        makeUsage('UniqueWidget', '/repoA/page.tsx', '/repoA/UniqueWidget.tsx', 'local'),
        // local-reuse
        makeUsage('SharedForm', '/repoA/page1.tsx', '/repoA/SharedForm.tsx', 'local'),
        makeUsage('SharedForm', '/repoA/page2.tsx', '/repoA/SharedForm.tsx', 'local'),
        // cross-repo
        makeUsage('CoreCard', '/repoA/page.tsx', '/shared/CoreCard.tsx', 'local'),
      ]),
      makeRepo('repo-b', [
        // cross-repo (same resolvedPath as above)
        makeUsage('CoreCard', '/repoB/page.tsx', '/shared/CoreCard.tsx', 'local'),
        // inline
        makeUsage('Inline', '/repoB/page.tsx', null, 'local'),
      ]),
    ]);

    expect(result.totalTracked).toBe(3); // UniqueWidget, SharedForm, CoreCard
    expect(result.inlineCount).toBe(1);
    expect(result.singletonCount).toBe(1); // UniqueWidget
    expect(result.localReuseCount).toBe(1); // SharedForm
    expect(result.crossRepoCount).toBe(1); // CoreCard
  });

  it('non-local categories are ignored', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        makeUsage('Button', '/file.tsx', null, 'design-system'),
        makeUsage('Select', '/file.tsx', null, 'third-party'),
        makeUsage('SharedLayout', '/file.tsx', '/shared/Layout.tsx', 'local-library'),
        makeUsage('div', '/file.tsx', null, 'html-native'),
      ]),
    ]);
    expect(result.totalTracked).toBe(0);
    expect(result.inlineCount).toBe(0);
  });

  it('topCandidates sorts cross-repo first, then by filesUsedIn, then instances', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        makeUsage('LocalReuse', '/repoA/f1.tsx', '/path/LocalReuse.tsx', 'local'),
        makeUsage('LocalReuse', '/repoA/f2.tsx', '/path/LocalReuse.tsx', 'local'),
        makeUsage('LocalReuse', '/repoA/f3.tsx', '/path/LocalReuse.tsx', 'local'),
        makeUsage('CrossRepo', '/repoA/f.tsx', '/path/CrossRepo.tsx', 'local'),
      ]),
      makeRepo('repo-b', [
        makeUsage('CrossRepo', '/repoB/f.tsx', '/path/CrossRepo.tsx', 'local'),
      ]),
    ]);

    // CrossRepo has reposUsedIn=2, LocalReuse has reposUsedIn=1
    expect(result.topCandidates[0]!.componentName).toBe('CrossRepo');
    expect(result.topCandidates[1]!.componentName).toBe('LocalReuse');
  });

  it('topCandidates is capped at 20 entries', () => {
    const usages: CategorizedUsage[] = [];
    // 25 distinct local-reuse components (each used in 2 files in same repo)
    for (let i = 0; i < 25; i++) {
      usages.push(makeUsage(`Comp${i}`, `/repo/f1.tsx`, `/repo/Comp${i}.tsx`, 'local'));
      usages.push(makeUsage(`Comp${i}`, `/repo/f2.tsx`, `/repo/Comp${i}.tsx`, 'local'));
    }
    const result = buildLocalReuseAnalysis([makeRepo('repo-a', usages)]);
    expect(result.localReuseCount).toBe(25);
    expect(result.topCandidates).toHaveLength(20);
  });

  it('counts same file used multiple times as 1 file entry (singleton)', () => {
    const result = buildLocalReuseAnalysis([
      makeRepo('repo-a', [
        // Same component used 3 times in the same file
        makeUsage('Card', '/repo/page.tsx', '/repo/Card.tsx', 'local'),
        makeUsage('Card', '/repo/page.tsx', '/repo/Card.tsx', 'local'),
        makeUsage('Card', '/repo/page.tsx', '/repo/Card.tsx', 'local'),
      ]),
    ]);
    expect(result.singletonCount).toBe(1); // 1 unique file → singleton
    expect(result.totalTracked).toBe(1);
    // singletons are NOT in topCandidates (only reuse candidates are)
    expect(result.topCandidates).toHaveLength(0);
  });

  it('empty repoData returns zeroed report', () => {
    const result = buildLocalReuseAnalysis([]);
    expect(result.totalTracked).toBe(0);
    expect(result.inlineCount).toBe(0);
    expect(result.singletonCount).toBe(0);
    expect(result.localReuseCount).toBe(0);
    expect(result.crossRepoCount).toBe(0);
    expect(result.topCandidates).toHaveLength(0);
  });
});
