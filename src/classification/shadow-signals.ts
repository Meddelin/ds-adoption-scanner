// src/classification/shadow-signals.ts
// Deterministic shadow usage signal detection
// NO AI, NO embeddings — only structural/rule-based signals

import type { ShadowSignal, ShadowSignalType } from '../domain/types.js';
import type { CategorizedUsage } from '../types.js';
import type { ClassificationContext, ShadowSignalDetector } from './types.js';
import {
  DEFAULT_SHADOW_THRESHOLDS,
  PRIMITIVE_NAME_PATTERNS,
} from '../domain/constants.js';

/**
 * Reusable local component detector.
 * Signal: used in >= N files.
 */
export class ReusableLocalDetector implements ShadowSignalDetector {
  readonly type: ShadowSignalType = 'reusable-local';

  detect(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): ShadowSignal | null {
    const threshold = context.thresholds.shadowFileThreshold;

    // Count unique files
    const fileSet = new Set(usages.map(u => u.filePath));
    const fileCount = fileSet.size;

    if (fileCount >= threshold) {
      return {
        type: this.type,
        strength: fileCount >= threshold * 2 ? 'strong' : 'moderate',
        evidence: `Component used in ${fileCount} files (threshold: ${threshold})`,
        value: fileCount,
      };
    }

    return null;
  }
}

/**
 * Multi-route usage detector.
 * Signal: used across >= M routes.
 */
export class MultiRouteDetector implements ShadowSignalDetector {
  readonly type: ShadowSignalType = 'multi-route';

  detect(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): ShadowSignal | null {
    if (!context.routeMapping) {
      return null;
    }

    const threshold = context.thresholds.shadowRouteThreshold;

    // Count unique routes
    const routeSet = new Set<string>();
    for (const usage of usages) {
      const route = context.routeMapping.get(usage.filePath);
      if (route) {
        routeSet.add(route);
      }
    }

    const routeCount = routeSet.size;

    if (routeCount >= threshold) {
      return {
        type: this.type,
        strength: routeCount >= threshold * 2 ? 'strong' : 'moderate',
        evidence: `Component used across ${routeCount} routes (threshold: ${threshold})`,
        value: routeCount,
      };
    }

    return null;
  }
}

/**
 * UI family pattern detector.
 * Signal: part of a local UI component family.
 */
export class UIFamilyDetector implements ShadowSignalDetector {
  readonly type: ShadowSignalType = 'ui-family';

  detect(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): ShadowSignal | null {
    // Check if component is part of a family (has related components in same directory)
    const paths = usages
      .map(u => u.resolvedPath)
      .filter((p): p is string => p !== null);

    if (paths.length === 0) {
      return null;
    }

    // Extract directory from first usage
    const dir = paths[0].replace(/\\/g, '/').split('/').slice(0, -1).join('/');

    // Check for family pattern (e.g., Button, ButtonGroup in same dir)
    const familyName = this.extractFamilyName(componentName);
    const hasFamilyMembers = paths.some(p => {
      const otherName = p.split('/').pop()?.replace(/\.(tsx|jsx|ts|js)$/, '');
      return otherName && otherName !== componentName && otherName.startsWith(familyName);
    });

    if (hasFamilyMembers) {
      return {
        type: this.type,
        strength: 'moderate',
        evidence: `Component part of UI family "${familyName}" with related components`,
      };
    }

    return null;
  }

  private extractFamilyName(componentName: string): string {
    // Remove common suffixes
    return componentName.replace(/(Group|List|Item|Component)$/, '');
  }
}

/**
 * Substantial markup detector.
 * Signal: component has significant JSX markup.
 * Note: This requires AST analysis of component source.
 */
export class SubstantialMarkupDetector implements ShadowSignalDetector {
  readonly type: ShadowSignalType = 'substantial-markup';

  detect(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): ShadowSignal | null {
    // This is a placeholder — actual implementation would need to:
    // 1. Parse the component source file
    // 2. Count JSX elements in the component
    // 3. Return signal if count > threshold

    // For now, use heuristic based on component name patterns
    const hasSubstantialName =
      /(Form|List|Table|Card|Modal|Dialog|Panel|Section|Page|Layout|View|Screen)/.test(
        componentName
      );

    if (hasSubstantialName) {
      return {
        type: this.type,
        strength: 'moderate',
        evidence: `Component name "${componentName}" suggests substantial UI markup`,
      };
    }

    return null;
  }
}

/**
 * Parallel layer detector.
 * Signal: local components form a consistent UI layer.
 */
export class ParallelLayerDetector implements ShadowSignalDetector {
  readonly type: ShadowSignalType = 'parallel-layer';

  detect(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): ShadowSignal | null {
    // Check if component is in a directory with many other local components
    const paths = usages
      .map(u => u.resolvedPath)
      .filter((p): p is string => p !== null);

    if (paths.length === 0) {
      return null;
    }

    // This is a simplified check — actual implementation would:
    // 1. Analyze the directory structure
    // 2. Check for consistent patterns (e.g., all components in "components/ui/")
    // 3. Compare with DS component names

    const dir = paths[0].replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const isUILayer =
      /\/(components|ui|shared|common)\//.test(dir) ||
      /\/(components|ui|shared|common)$/.test(dir);

    if (isUILayer) {
      return {
        type: this.type,
        strength: 'moderate',
        evidence: `Component located in UI layer directory: ${dir}`,
      };
    }

    return null;
  }
}

/**
 * Primitive-like name detector.
 * Signal: component name matches primitive UI patterns.
 */
export class PrimitiveLikeDetector implements ShadowSignalDetector {
  readonly type: ShadowSignalType = 'primitive-like';

  detect(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): ShadowSignal | null {
    const matchesPrimitive = PRIMITIVE_NAME_PATTERNS.some(pattern =>
      pattern.test(componentName)
    );

    if (matchesPrimitive) {
      return {
        type: this.type,
        strength: 'weak',
        evidence: `Component name "${componentName}" matches primitive UI pattern`,
      };
    }

    return null;
  }
}

/**
 * Factory to create all shadow signal detectors.
 */
export function createShadowDetectors(
  enabledSignals: ShadowSignalType[]
): ShadowSignalDetector[] {
  const allDetectors: ShadowSignalDetector[] = [
    new ReusableLocalDetector(),
    new MultiRouteDetector(),
    new UIFamilyDetector(),
    new SubstantialMarkupDetector(),
    new ParallelLayerDetector(),
    new PrimitiveLikeDetector(),
  ];

  return allDetectors.filter(d => enabledSignals.includes(d.type));
}

/**
 * Detect all shadow signals for a component.
 */
export function detectShadowSignals(
  componentName: string,
  usages: CategorizedUsage[],
  context: ClassificationContext,
  detectors: ShadowSignalDetector[]
): ShadowSignal[] {
  const signals: ShadowSignal[] = [];

  for (const detector of detectors) {
    const signal = detector.detect(componentName, usages, context);
    if (signal) {
      signals.push(signal);
    }
  }

  return signals;
}

/**
 * Calculate overall shadow score from signals.
 */
export function calculateShadowScore(signals: ShadowSignal[]): number {
  if (signals.length === 0) {
    return 0;
  }

  const strengthWeights = {
    strong: 3,
    moderate: 2,
    weak: 1,
  };

  const totalWeight = signals.reduce((sum, s) => sum + strengthWeights[s.strength], 0);

  // Normalize to 0-100 scale
  // Max possible: 6 signals * 3 (strong) = 18
  return Math.min(100, (totalWeight / 18) * 100);
}
