// src/classification/types.ts
// Classification layer types

import type {
  ClassifiedUsage,
  LocalComponentProfile,
  ShadowSignal,
  AnalyticalBucket,
  ClassificationSource,
  ClassificationConfidence,
} from '../domain/types.js';
import type { CategorizedUsage } from '../types.js';
import type { ThirdPartyWithoutDSBucket } from '../config/schema.js';

// ─── Classifier Interface ─────────────────────────────────────────────────────

/**
 * Interface for analytical classifiers.
 */
export interface AnalyticalClassifierContract {
  /** Classifier name */
  readonly name: string;

  /**
   * Classify a single usage.
   * Returns classified usage with bucket assignment.
   */
  classify(usage: CategorizedUsage, context: ClassificationContext): ClassifiedUsage;

  /**
   * Build local component profiles for shadow/neither classification.
   */
  buildProfiles(
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): LocalComponentProfile[];
}

// ─── Classification Context ───────────────────────────────────────────────────

/**
 * Context available during classification.
 */
export interface ClassificationContext {
  /** Repository path */
  repoPath: string;

  /** Route information (if available) */
  routeMapping?: Map<string, string | string[]>; // filePath -> routeId(s)

  /** Design system configuration */
  designSystems: { name: string; packages: string[] }[];

  /** Local library patterns */
  localLibraryPatterns: string[];

  /** Thresholds */
  thresholds: {
    reusableFileThreshold: number;
    shadowFileThreshold: number;
    shadowRouteThreshold: number;
    substantialMarkupThreshold: number;
  };

  /** Feature flags */
  features: {
    shadowDetection: boolean;
    neitherDetection: boolean;
  };

  /** Policy for third-party usages without DS backing */
  thirdPartyWithoutDSBucket: ThirdPartyWithoutDSBucket;
}

// ─── Classification Result ────────────────────────────────────────────────────

/**
 * Result of classification batch operation.
 */
export interface ClassificationResult {
  /** All classified usages */
  usages: ClassifiedUsage[];

  /** Local component profiles */
  profiles: LocalComponentProfile[];

  /** Statistics by bucket */
  stats: {
    adoption: { count: number; instances: number };
    shadow: { count: number; instances: number };
    neither: { count: number; instances: number };
  };

  /** Classification errors/warnings */
  warnings: string[];
}

// ─── Shadow Signal Detector ───────────────────────────────────────────────────

/**
 * Interface for shadow signal detectors.
 */
export interface ShadowSignalDetector {
  /** Signal type */
  readonly type: ShadowSignal['type'];

  /**
   * Detect signal for a component.
   * Returns signal if detected, null otherwise.
   */
  detect(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): ShadowSignal | null;
}

// ─── Neither Heuristic ────────────────────────────────────────────────────────

/**
 * Interface for neither heuristics.
 */
export interface NeitherHeuristic {
  /** Heuristic name */
  readonly name: string;

  /**
   * Check if component matches neither criteria.
   */
  check(
    componentName: string,
    usages: CategorizedUsage[],
    context: ClassificationContext
  ): boolean;

  /** Explanation of why component matched */
  getExplanation(componentName: string): string;
}

// ─── Classification Rule ──────────────────────────────────────────────────────

/**
 * Single classification rule.
 */
export interface ClassificationRule {
  /** Rule name */
  name: string;

  /** Condition to check */
  condition: (usage: CategorizedUsage, context: ClassificationContext) => boolean;

  /** Bucket to assign if condition matches */
  bucket: AnalyticalBucket;

  /** Classification source */
  source: ClassificationSource;

  /** Confidence level */
  confidence: ClassificationConfidence;

  /** Rule priority (higher = evaluated first) */
  priority: number;
}

// ─── Classification Config ────────────────────────────────────────────────────

/**
 * Configuration for classification.
 */
export interface ClassificationConfig {
  /** Shadow signal detectors to enable */
  shadowSignals: ShadowSignal['type'][];

  /** Neither heuristics to enable */
  neitherHeuristics: string[];

  /** Custom rules */
  customRules?: ClassificationRule[];

  /** Threshold overrides */
  thresholds?: Partial<ClassificationContext['thresholds']>;
}
