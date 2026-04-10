// src/classification/neither-heuristics.ts
// Heuristics for detecting "Neither" bucket components
// These are utility/business wrappers that shouldn't count in adoption or shadow

import type { CategorizedUsage } from '../types.js';
import type { ClassificationContext, NeitherHeuristic } from './types.js';
import { DEFAULT_NEITHER_HEURISTICS } from '../domain/constants.js';
import { analyzeComponentSource } from './source-analysis.js';

/**
 * Utility pattern heuristic.
 * Detects Provider, Context, Hook patterns by name.
 */
export class UtilityPatternHeuristic implements NeitherHeuristic {
  readonly name = 'utility-pattern';

  private patterns: RegExp[];

  constructor(patterns?: RegExp[]) {
    this.patterns = patterns ?? DEFAULT_NEITHER_HEURISTICS[0].patterns;
  }

  check(
    componentName: string,
    _usages: CategorizedUsage[],
    _context: ClassificationContext
  ): boolean {
    return this.patterns.some(pattern => pattern.test(componentName));
  }

  getExplanation(componentName: string): string {
    return `Component name "${componentName}" matches utility pattern`;
  }
}

/**
 * Data component heuristic.
 * Name matches a data-fetching pattern AND the source has ≤ 2 JSX elements
 * (confirmed via AST when a resolved path is available).
 */
export class DataComponentHeuristic implements NeitherHeuristic {
  readonly name = 'data-component';

  private patterns: RegExp[];
  private maxJsxElements: number;

  constructor(patterns?: RegExp[], maxJsxElements?: number) {
    this.patterns = patterns ?? DEFAULT_NEITHER_HEURISTICS[1].patterns;
    this.maxJsxElements = maxJsxElements ?? DEFAULT_NEITHER_HEURISTICS[1].maxJsxElements ?? 2;
  }

  check(
    componentName: string,
    usages: CategorizedUsage[],
    _context: ClassificationContext
  ): boolean {
    const nameMatches = this.patterns.some(p => p.test(componentName));
    if (!nameMatches) {
      return false;
    }

    // Try AST confirmation: data components render very little JSX
    const sourcePath = usages.map(u => u.resolvedPath).find((p): p is string => typeof p === 'string');
    if (sourcePath) {
      const analysis = analyzeComponentSource(sourcePath);
      if (analysis) {
        return analysis.jsxElementCount <= this.maxJsxElements;
      }
    }

    // Fallback: trust the name pattern when source is unavailable
    return true;
  }

  getExplanation(componentName: string): string {
    return `Component name "${componentName}" matches data fetching pattern`;
  }
}

/**
 * Layout wrapper heuristic.
 * Name matches a layout pattern AND (when source available) the JSX tree is
 * shallow (depth ≤ 3), confirming it's a structural shell rather than rich UI.
 */
export class LayoutWrapperHeuristic implements NeitherHeuristic {
  readonly name = 'layout-wrapper';

  private patterns: RegExp[];

  constructor(patterns?: RegExp[]) {
    this.patterns = patterns ?? DEFAULT_NEITHER_HEURISTICS[2].patterns;
  }

  check(
    componentName: string,
    usages: CategorizedUsage[],
    _context: ClassificationContext
  ): boolean {
    const nameMatches = this.patterns.some(p => p.test(componentName));
    if (!nameMatches) {
      return false;
    }

    // AST confirmation: layout wrappers are shallow structural shells
    const sourcePath = usages.map(u => u.resolvedPath).find((p): p is string => typeof p === 'string');
    if (sourcePath) {
      const analysis = analyzeComponentSource(sourcePath);
      if (analysis) {
        // A deep JSX tree (depth > 3) suggests rich UI content → not a simple layout
        return analysis.topLevelJSXDepth <= 3;
      }
    }

    // Fallback: trust the name pattern
    return true;
  }

  getExplanation(componentName: string): string {
    return `Component name "${componentName}" matches layout wrapper pattern`;
  }
}

/**
 * Thin wrapper heuristic.
 * AST-based: component has ≤ 2 JSX elements AND (renders only children OR
 * has spread attributes). Name suffix heuristics are a secondary fallback.
 */
export class ThinWrapperHeuristic implements NeitherHeuristic {
  readonly name = 'thin-wrapper';

  check(
    componentName: string,
    usages: CategorizedUsage[],
    _context: ClassificationContext
  ): boolean {
    const sourcePath = usages
      .map(u => u.resolvedPath)
      .find((p): p is string => typeof p === 'string');

    if (sourcePath) {
      const analysis = analyzeComponentSource(sourcePath);
      if (analysis) {
        // AST signal: renders only children (pass-through) or single element
        // with spread props and very little markup
        if (analysis.isRendersOnlyChildren) {
          return true;
        }
        if (analysis.jsxElementCount <= 2 && analysis.hasSpreadAttributes) {
          return true;
        }
        return false;
      }
    }

    // Fallback when source is unavailable: name-based heuristic
    const fallbackPatterns = [/Wrapper$/, /Container$/, /^With[A-Z]/, /HOC$/];
    return fallbackPatterns.some(p => p.test(componentName));
  }

  getExplanation(componentName: string): string {
    return `Component "${componentName}" appears to be a thin wrapper (AST-confirmed)`;
  }
}

/**
 * Business logic heuristic.
 * Detects business-specific components that aren't UI (name-based only,
 * as business logic rarely has meaningful JSX structure to analyse).
 */
export class BusinessLogicHeuristic implements NeitherHeuristic {
  readonly name = 'business-logic';

  private businessPatterns = [
    /Auth/i,
    /Permission/i,
    /Role/i,
    /FeatureFlag/i,
    /Experiment/i,
    /Tracking/i,
    /Analytics/i,
    /Logger/i,
  ];

  check(
    componentName: string,
    _usages: CategorizedUsage[],
    _context: ClassificationContext
  ): boolean {
    return this.businessPatterns.some(pattern => pattern.test(componentName));
  }

  getExplanation(componentName: string): string {
    return `Component "${componentName}" appears to be business logic, not UI`;
  }
}

/**
 * Factory to create all neither heuristics.
 */
export function createNeitherHeuristics(enabledHeuristics: string[]): NeitherHeuristic[] {
  const allHeuristics: NeitherHeuristic[] = [
    new UtilityPatternHeuristic(),
    new DataComponentHeuristic(),
    new LayoutWrapperHeuristic(),
    new ThinWrapperHeuristic(),
    new BusinessLogicHeuristic(),
  ];

  return allHeuristics.filter(h => enabledHeuristics.includes(h.name));
}

/**
 * Check if component matches any neither heuristic.
 */
export function checkNeitherHeuristics(
  componentName: string,
  usages: CategorizedUsage[],
  context: ClassificationContext,
  heuristics: NeitherHeuristic[]
): { isNeither: boolean; explanation?: string } {
  for (const heuristic of heuristics) {
    if (heuristic.check(componentName, usages, context)) {
      return {
        isNeither: true,
        explanation: heuristic.getExplanation(componentName),
      };
    }
  }

  return { isNeither: false };
}
