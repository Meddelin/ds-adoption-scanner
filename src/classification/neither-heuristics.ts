// src/classification/neither-heuristics.ts
// Heuristics for detecting "Neither" bucket components
// These are utility/business wrappers that shouldn't count in adoption or shadow

import type { CategorizedUsage } from '../types.js';
import type { ClassificationContext, NeitherHeuristic } from './types.js';
import { DEFAULT_NEITHER_HEURISTICS } from '../domain/constants.js';

/**
 * Utility pattern heuristic.
 * Detects Provider, Context, Hook patterns.
 */
export class UtilityPatternHeuristic implements NeitherHeuristic {
  readonly name = 'utility-pattern';

  private patterns: RegExp[];

  constructor(patterns?: RegExp[]) {
    this.patterns = patterns ?? DEFAULT_NEITHER_HEURISTICS[0].patterns;
  }

  check(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): boolean {
    return this.patterns.some(pattern => pattern.test(componentName));
  }

  getExplanation(componentName: string): string {
    return `Component name "${componentName}" matches utility pattern`;
  }
}

/**
 * Data component heuristic.
 * Detects Query, Mutation, Fetcher patterns.
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
    context: ClassificationContext
  ): boolean {
    // Check name pattern
    const nameMatches = this.patterns.some(pattern => pattern.test(componentName));

    if (!nameMatches) {
      return false;
    }

    // Additional check: data components typically have few JSX elements
    // This would require AST analysis in full implementation
    // For now, rely on name pattern

    return true;
  }

  getExplanation(componentName: string): string {
    return `Component name "${componentName}" matches data fetching pattern`;
  }
}

/**
 * Layout wrapper heuristic.
 * Detects Layout, Page, Template patterns.
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
    context: ClassificationContext
  ): boolean {
    return this.patterns.some(pattern => pattern.test(componentName));
  }

  getExplanation(componentName: string): string {
    return `Component name "${componentName}" matches layout wrapper pattern`;
  }
}

/**
 * Thin wrapper heuristic.
 * Detects components that just pass through props.
 */
export class ThinWrapperHeuristic implements NeitherHeuristic {
  readonly name = 'thin-wrapper';

  check(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): boolean {
    // This would require AST analysis to detect:
    // - Component just renders children
    // - Component just spreads props
    // - Component has no additional markup

    // For now, use naming heuristic
    const wrapperPatterns = [/Wrapper$/, /Container$/, /With/, /HOC$/];
    return wrapperPatterns.some(pattern => pattern.test(componentName));
  }

  getExplanation(componentName: string): string {
    return `Component "${componentName}" appears to be a thin wrapper`;
  }
}

/**
 * Business logic heuristic.
 * Detects business-specific components that aren't UI.
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
    usages: CategorizedUsage[],
    context: ClassificationContext
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
