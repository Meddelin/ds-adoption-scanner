import { describe, expect, it } from 'vitest';
import {
  AnalyticalClassifier,
  createClassificationContext,
} from '../../src/classification/classifier.js';
import type { CategorizedUsage } from '../../src/types.js';

function makeUsage(
  componentName: string,
  filePath: string
): CategorizedUsage {
  return {
    componentName,
    localName: componentName,
    importEntry: {
      localName: componentName,
      importedName: componentName,
      source: '@shared/ui',
      type: 'named',
    },
    filePath,
    line: 1,
    column: 1,
    props: [],
    hasSpreadProps: false,
    category: 'local-library',
    dsName: null,
    packageName: '@shared/ui',
    resolvedPath: '/repo/src/shared/index.ts',
  };
}

describe('AnalyticalClassifier', () => {
  it('does not depend on usage order for multi-export modules', () => {
    const ctx = createClassificationContext('/repo', [{ name: 'DS', packages: ['@ds/ui'] }]);
    const classifier = new AnalyticalClassifier(ctx);

    const aFirst = classifier.classify([
      makeUsage('Button', '/repo/src/a.tsx'),
      makeUsage('AuthProvider', '/repo/src/b.tsx'),
    ]);
    const bFirst = classifier.classify([
      makeUsage('AuthProvider', '/repo/src/b.tsx'),
      makeUsage('Button', '/repo/src/a.tsx'),
    ]);

    const key = (u: (typeof aFirst.usages)[number]) => `${u.componentName}:${u.analyticalBucket}`;

    expect(new Set(aFirst.usages.map(key))).toEqual(new Set(bFirst.usages.map(key)));
  });
});
