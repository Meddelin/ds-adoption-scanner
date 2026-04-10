import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AnalyticalClassifier,
  createClassificationContext,
} from '../../src/classification/classifier.js';
import { clearComponentSourceAnalysisCache } from '../../src/classification/source-analysis.js';
import type { CategorizedUsage } from '../../src/types.js';

function makeUsage(componentName: string, filePath: string, resolvedPath: string): CategorizedUsage {
  return {
    componentName,
    localName: componentName,
    importEntry: {
      localName: componentName,
      importedName: componentName,
      source: `./${componentName}`,
      type: 'named',
    },
    filePath,
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

function createClassifier(repoPath: string): AnalyticalClassifier {
  const context = createClassificationContext(repoPath, [{ name: 'DS', packages: ['@ds/ui'] }], {
    features: {
      shadowDetection: true,
      neitherDetection: false,
    },
    thresholds: {
      shadowFileThreshold: 2,
      shadowRouteThreshold: 2,
      substantialMarkupThreshold: 5,
    },
  });

  return new AnalyticalClassifier(context);
}

const tempDirs: string[] = [];

afterEach(() => {
  clearComponentSourceAnalysisCache();
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('SubstantialMarkupDetector', () => {
  it('classifies local component as shadow using AST JSX element count', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-shadow-'));
    tempDirs.push(tempDir);

    const componentPath = path.join(tempDir, 'FancyWidget.tsx');
    fs.writeFileSync(
      componentPath,
      [
        'export function FancyWidget() {',
        '  return (',
        '    <section>',
        '      <header><h1>Title</h1></header>',
        '      <div><span>A</span></div>',
        '      <footer><button>Ok</button></footer>',
        '    </section>',
        '  );',
        '}',
      ].join('\n'),
      'utf-8'
    );

    const classifier = createClassifier(tempDir);
    const usage = makeUsage(
      'FancyWidget',
      path.join(tempDir, 'consumer.tsx'),
      componentPath
    );

    const result = classifier.classify([usage]);
    expect(result.usages).toHaveLength(1);
    expect(result.usages[0]!.analyticalBucket).toBe('shadow');
    expect(result.usages[0]!.shadowSignals?.some(s => s.type === 'substantial-markup')).toBe(true);
  });

  it('does not classify local component as shadow when JSX count is below threshold', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-shadow-'));
    tempDirs.push(tempDir);

    const componentPath = path.join(tempDir, 'TinyWidget.tsx');
    fs.writeFileSync(
      componentPath,
      [
        'export function TinyWidget() {',
        '  return <div><span>Small</span></div>;',
        '}',
      ].join('\n'),
      'utf-8'
    );

    const classifier = createClassifier(tempDir);
    const usage = makeUsage(
      'TinyWidget',
      path.join(tempDir, 'consumer.tsx'),
      componentPath
    );

    const result = classifier.classify([usage]);
    expect(result.usages).toHaveLength(1);
    expect(result.usages[0]!.analyticalBucket).toBe('neither');
    expect(result.usages[0]!.shadowSignals ?? []).toHaveLength(0);
  });
});
