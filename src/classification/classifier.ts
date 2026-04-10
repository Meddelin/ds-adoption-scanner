// src/classification/classifier.ts
// Main analytical classifier

import type {
  ClassifiedUsage,
  LocalComponentProfile,
  AnalyticalBucket,
  ClassificationSource,
  ClassificationConfidence,
  ShadowSignal,
} from '../domain/types.js';
import type { CategorizedUsage, ComponentCategory } from '../types.js';
import type {
  ClassificationContext,
  ClassificationResult,
  ShadowSignalDetector,
  NeitherHeuristic,
} from './types.js';
import {
  createShadowDetectors,
  detectShadowSignals,
  calculateShadowScore,
} from './shadow-signals.js';
import { createNeitherHeuristics, checkNeitherHeuristics } from './neither-heuristics.js';
import { CLASSIFICATION_SOURCE_PRIORITY } from '../domain/constants.js';

/**
 * Main analytical classifier.
 * Assigns usages to Adoption / Shadow / Neither buckets.
 */
export class AnalyticalClassifier {
  private shadowDetectors: ShadowSignalDetector[];
  private neitherHeuristics: NeitherHeuristic[];
  private context: ClassificationContext;

  constructor(context: ClassificationContext) {
    this.context = context;
    this.shadowDetectors = context.features.shadowDetection
      ? createShadowDetectors([
          'reusable-local',
          'multi-route',
          'ui-family',
          'substantial-markup',
          'parallel-layer',
          'primitive-like',
        ])
      : [];
    this.neitherHeuristics = context.features.neitherDetection
      ? createNeitherHeuristics([
          'utility-pattern',
          'data-component',
          'layout-wrapper',
          'thin-wrapper',
          'business-logic',
        ])
      : [];
  }

  /**
   * Classify all usages.
   */
  classify(usages: CategorizedUsage[]): ClassificationResult {
    const warnings: string[] = [];

    // First pass: classify by structural category and DS backing
    const firstPass = usages.map(u => this.classifyByStructure(u));

    // Build local component profiles for shadow/neither classification
    const profiles = this.buildLocalProfiles(firstPass);

    // Second pass: apply shadow/neither classification to local components
    const classified = firstPass.map(usage => {
      if (usage.category === 'local' || usage.category === 'local-library') {
        return this.applyLocalClassification(usage, profiles);
      }
      return usage;
    });

    // Calculate statistics
    const stats = this.calculateStats(classified);

    return {
      usages: classified,
      profiles,
      stats,
      warnings,
    };
  }

  /**
   * First pass classification based on structural category.
   */
  private classifyByStructure(usage: CategorizedUsage): ClassifiedUsage {
    // Design system -> Adoption
    if (usage.category === 'design-system') {
      return {
        ...usage,
        analyticalBucket: 'adoption',
        classificationSource: 'direct-ds',
        classificationConfidence: 'high',
      };
    }

    // HTML native -> Neither (excluded from metrics)
    if (usage.category === 'html-native') {
      return {
        ...usage,
        analyticalBucket: 'neither',
        classificationSource: 'utility-heuristic',
        classificationConfidence: 'high',
      };
    }

    // Third-party without DS backing -> Neither (for now)
    if (usage.category === 'third-party' && !usage.transitiveDS) {
      return {
        ...usage,
        analyticalBucket: 'neither',
        classificationSource: 'utility-heuristic',
        classificationConfidence: 'medium',
      };
    }

    // Local-library with DS backing -> Adoption (transitive)
    if (usage.category === 'local-library' && usage.transitiveDS) {
      return {
        ...usage,
        analyticalBucket: 'adoption',
        classificationSource:
          usage.transitiveDS.source === 'declared' ? 'transitive-declared' : 'transitive-auto',
        classificationConfidence: usage.transitiveDS.coverage >= 1 ? 'high' : 'medium',
      };
    }

    // Third-party with DS backing -> Adoption (transitive)
    if (usage.category === 'third-party' && usage.transitiveDS) {
      return {
        ...usage,
        analyticalBucket: 'adoption',
        classificationSource:
          usage.transitiveDS.source === 'declared' ? 'transitive-declared' : 'transitive-auto',
        classificationConfidence: usage.transitiveDS.coverage >= 1 ? 'high' : 'medium',
      };
    }

    // Local and local-library without DS backing -> needs further classification
    return {
      ...usage,
      analyticalBucket: 'unclassified',
      classificationSource: 'unclassified',
      classificationConfidence: 'low',
    };
  }

  /**
   * Build profiles for local components.
   */
  private buildLocalProfiles(usages: ClassifiedUsage[]): LocalComponentProfile[] {
    // Group by resolved path
    const byPath = new Map<string, CategorizedUsage[]>();

    for (const usage of usages) {
      if (usage.category !== 'local' && usage.category !== 'local-library') {
        continue;
      }

      const path = usage.resolvedPath;
      if (!path) continue;

      const existing = byPath.get(path);
      if (existing) {
        existing.push(usage);
      } else {
        byPath.set(path, [usage]);
      }
    }

    // Build profiles
    const profiles: LocalComponentProfile[] = [];

    for (const [resolvedPath, componentUsages] of byPath) {
      const componentName = componentUsages[0].componentName;

      // Detect shadow signals
      const signals = detectShadowSignals(
        componentName,
        componentUsages,
        this.context,
        this.shadowDetectors
      );

      // Check neither heuristics
      const neitherCheck = checkNeitherHeuristics(
        componentName,
        componentUsages,
        this.context,
        this.neitherHeuristics
      );

      // Determine bucket
      let bucket: AnalyticalBucket;
      let primarySignal: ShadowSignal['type'] | undefined;

      if (neitherCheck.isNeither) {
        bucket = 'neither';
      } else if (signals.length > 0) {
        bucket = 'shadow';
        primarySignal = signals[0].type;
      } else {
        // Default: small local components go to neither
        bucket = 'neither';
      }

      // Calculate file and route counts
      const fileSet = new Set(componentUsages.map(u => u.filePath));
      const routeSet = new Set<string>();
      if (this.context.routeMapping) {
        for (const usage of componentUsages) {
          const route = this.context.routeMapping.get(usage.filePath);
          if (route) routeSet.add(route);
        }
      }

      profiles.push({
        componentName,
        resolvedPath,
        structuralCategory: componentUsages[0].category as 'local' | 'local-library',
        usages: componentUsages as ClassifiedUsage[],
        fileCount: fileSet.size,
        routeCount: routeSet.size,
        signals,
        hasSignificantMarkup: signals.some(s => s.type === 'substantial-markup'),
        isPrimitiveLike: signals.some(s => s.type === 'primitive-like'),
        isUtilityLike: neitherCheck.isNeither,
        analyticalBucket: bucket,
        primarySignal: primarySignal,
      });
    }

    return profiles;
  }

  /**
   * Apply local classification to a usage based on its component profile.
   */
  private applyLocalClassification(
    usage: ClassifiedUsage,
    profiles: LocalComponentProfile[]
  ): ClassifiedUsage {
    const path = usage.resolvedPath;
    if (!path) {
      // Inline component -> neither
      return {
        ...usage,
        analyticalBucket: 'neither',
        classificationSource: 'utility-heuristic',
        classificationConfidence: 'medium',
      };
    }

    const profile = profiles.find(p => p.resolvedPath === path);
    if (!profile) {
      // Should not happen
      return {
        ...usage,
        analyticalBucket: 'neither',
        classificationSource: 'unclassified',
        classificationConfidence: 'low',
      };
    }

    return {
      ...usage,
      analyticalBucket: profile.analyticalBucket,
      classificationSource:
        profile.analyticalBucket === 'shadow'
          ? 'local-ui-signal'
          : profile.analyticalBucket === 'adoption'
            ? 'direct-ds'
            : 'utility-heuristic',
      classificationConfidence: profile.analyticalBucket === 'shadow' ? 'medium' : 'high',
      shadowSignals: profile.signals,
    };
  }

  /**
   * Calculate classification statistics.
   */
  private calculateStats(usages: ClassifiedUsage[]) {
    const stats = {
      adoption: { count: 0, instances: 0 },
      shadow: { count: 0, instances: 0 },
      neither: { count: 0, instances: 0 },
    };

    for (const usage of usages) {
      const bucket = usage.analyticalBucket;
      if (bucket === 'adoption' || bucket === 'shadow' || bucket === 'neither') {
        stats[bucket].instances++;
      }
    }

    // Count unique components per bucket
    const uniqueByBucket = {
      adoption: new Set<string>(),
      shadow: new Set<string>(),
      neither: new Set<string>(),
    };

    for (const usage of usages) {
      const bucket = usage.analyticalBucket;
      if (bucket === 'adoption' || bucket === 'shadow' || bucket === 'neither') {
        const key = usage.resolvedPath ?? `${usage.filePath}:${usage.componentName}`;
        uniqueByBucket[bucket].add(key);
      }
    }

    stats.adoption.count = uniqueByBucket.adoption.size;
    stats.shadow.count = uniqueByBucket.shadow.size;
    stats.neither.count = uniqueByBucket.neither.size;

    return stats;
  }
}

/**
 * Create default classification context.
 */
export function createClassificationContext(
  repoPath: string,
  designSystems: { name: string; packages: string[] }[],
  options?: {
    routeMapping?: Map<string, string>;
    thresholds?: Partial<ClassificationContext['thresholds']>;
    features?: Partial<ClassificationContext['features']>;
  }
): ClassificationContext {
  return {
    repoPath,
    designSystems,
    localLibraryPatterns: [],
    routeMapping: options?.routeMapping,
    thresholds: {
      reusableFileThreshold: 2,
      shadowFileThreshold: 2,
      shadowRouteThreshold: 2,
      substantialMarkupThreshold: 5,
      ...options?.thresholds,
    },
    features: {
      shadowDetection: true,
      neitherDetection: true,
      ...options?.features,
    },
  };
}
