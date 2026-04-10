// src/domain/types.ts
// Core domain types for deterministic analytical model
// These types represent the new V2 analytical layer

import type { CategorizedUsage } from '../types.js';

// ─── Analytical Buckets ───────────────────────────────────────────────────────

/**
 * Mutually exclusive analytical buckets for all component usages.
 * Every usage MUST fall into exactly one bucket.
 */
export type AnalyticalBucket = 'adoption' | 'shadow' | 'neither';

/**
 * Source of classification decision — for explainability and debugging.
 */
export type ClassificationSource =
  | 'direct-ds' // Direct DS usage (category === 'design-system')
  | 'ds-backed-wrapper' // Library pre-scan confirmed DS backing
  | 'transitive-declared' // Config transitive rule matched
  | 'transitive-auto' // Auto-detected transitive (package.json check)
  | 'local-ui-signal' // Shadow usage signal detected
  | 'utility-heuristic' // Neither heuristic matched
  | 'unclassified'; // Fallback (should not happen in production)

/**
 * Confidence level for classification — helps users understand reliability.
 */
export type ClassificationConfidence = 'high' | 'medium' | 'low';

// ─── Shadow Usage Signals ─────────────────────────────────────────────────────

/**
 * Deterministic signals for Shadow Usage detection.
 * NO AI, NO embeddings, NO semantic similarity — only structural/rule-based signals.
 */
export type ShadowSignalType =
  | 'reusable-local' // Used in >= N files
  | 'multi-route' // Used across >= M routes
  | 'ui-family' // Part of local UI family pattern
  | 'substantial-markup' // > X JSX elements in component
  | 'parallel-layer' // Local components form consistent layer
  | 'primitive-like'; // Name matches primitive pattern

/**
 * Signal strength — helps prioritize shadow candidates.
 */
export type SignalStrength = 'strong' | 'moderate' | 'weak';

/**
 * A single shadow usage signal with explainable evidence.
 */
export interface ShadowSignal {
  type: ShadowSignalType;
  strength: SignalStrength;
  evidence: string; // Human-readable explanation
  value?: number; // Numeric value (e.g., file count, element count)
}

// ─── Classified Usage ─────────────────────────────────────────────────────────

/**
 * Extended usage record with analytical classification.
 * This is the primary unit of analysis in the V2 model.
 */
export interface ClassifiedUsage extends CategorizedUsage {
  // Analytical classification (mutually exclusive)
  analyticalBucket: AnalyticalBucket;
  classificationSource: ClassificationSource;
  classificationConfidence: ClassificationConfidence;

  // Shadow signals (only populated for shadow candidates)
  shadowSignals?: ShadowSignal[];

  // Route information (added during route resolution)
  routeId?: string;
  routeConfidence?: 'high' | 'medium' | 'low';
}

// ─── Local Component Profile ──────────────────────────────────────────────────

/**
 * Profile for local components used in shadow/neither classification.
 */
export interface LocalComponentProfile {
  // Identity
  componentName: string;
  resolvedPath: string;

  // Structural info
  structuralCategory: 'local' | 'local-library';
  usages: ClassifiedUsage[];

  // Usage metrics
  fileCount: number;
  routeCount: number;

  // Shadow signals
  signals: ShadowSignal[];
  hasSignificantMarkup: boolean;
  isPrimitiveLike: boolean;
  isUtilityLike: boolean;

  // Final classification
  analyticalBucket: AnalyticalBucket;
  primarySignal?: ShadowSignalType;
}

// ─── Route Types ──────────────────────────────────────────────────────────────

/**
 * Route match result with provenance.
 */
export interface RouteMatch {
  routeId: string; // Normalized route identifier (e.g., "/dashboard")
  routeKey: string; // Original key from file path
  filePath: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'nextjs-pages' | 'nextjs-app' | 'react-router' | 'path-pattern' | 'fallback-directory';
  pattern?: string; // Matched pattern (e.g., "[id]")
}

/**
 * Route-level metrics — primary focus of V2 model.
 */
export interface RouteMetrics {
  routeId: string;
  routeKey: string;
  confidence: 'high' | 'medium' | 'low';
  /** Which resolver detected this route */
  resolver?: 'react-router' | 'nextjs-pages' | 'nextjs-app' | 'path-pattern' | 'fallback-directory';

  // Bucket counts
  buckets: {
    adoption: { instances: number; components: number };
    shadow: { instances: number; components: number };
    neither: { instances: number; components: number };
  };

  // Detailed metrics
  directAdoption: MetricWithDetails;
  effectiveAdoptionProxy: MetricWithDetails;
  shadowUsageProxy: MetricWithDetails;

  // Component breakdown
  components: {
    adoption: string[];
    shadow: string[];
    neither: string[];
  };

  // Warnings for incomplete data
  warnings?: string[];
}

// ─── Metric Types ─────────────────────────────────────────────────────────────

/**
 * Metric with full transparency — formula, denominator, proxy status.
 */
export interface MetricWithDetails {
  percentage: number;
  instances: number;
  components: number;
  isProxy: boolean;
  formula: string;
  denominator: {
    instances: number;
    components: number;
    explanation: string;
  };
}

/**
 * Bucket breakdown statistics.
 */
export interface BucketStats {
  instances: number;
  components: number;
  percentage: number;
  topComponents: string[];
}

/**
 * Overall bucket breakdown.
 */
export interface BucketBreakdown {
  adoption: BucketStats;
  shadow: BucketStats;
  neither: BucketStats;
}

/**
 * Route coverage summary.
 */
export interface RouteCoverageSummary {
  totalFiles: number;
  mappedFiles: number;
  unmappedFiles: number;
  coveragePercentage: number;
  byConfidence: {
    high: number;
    medium: number;
    low: number;
  };
  warnings: string[];
}

// ─── V2 Report Types ──────────────────────────────────────────────────────────

/**
 * Design system metrics in V2 model.
 */
export interface DesignSystemMetricsV2 {
  name: string;
  packages: string[];

  // Direct adoption (exact metric)
  directAdoption: MetricWithDetails;

  // Effective adoption proxy (weighted by coverage)
  effectiveAdoptionProxy: MetricWithDetails;

  // Raw counts
  instances: number;
  transitiveInstances: number; // Weighted count
  uniqueComponents: number;

  // Family coverage (when pre-scan available)
  totalFamilies?: number;
  familiesUsed?: number;
  familyCoverage?: number;

  // Top components
  topComponents: {
    name: string;
    instances: number;
    filesUsedIn: number;
  }[];
}

/**
 * Repository metrics in V2 model.
 */
export interface RepositoryMetricsV2 {
  name: string;
  path: string;
  filesScanned: number;

  // Aggregated metrics
  directAdoption: MetricWithDetails;
  effectiveAdoptionProxy: MetricWithDetails;
  shadowUsageProxy: MetricWithDetails;
  bucketBreakdown: BucketBreakdown;

  // Per-DS breakdown
  designSystems: DesignSystemMetricsV2[];

  // Route-level data (if route resolution enabled)
  routes?: RouteMetrics[];

  // Warnings
  warnings?: string[];
}

/**
 * Scan report V2 schema — deterministic analytical model.
 */
export interface ScanReportV2 {
  version: '2.0';

  meta: {
    scannerVersion: string;
    timestamp: string;
    scanDurationMs: number;
    configPath: string;
    filesScanned: number;
    repositoriesScanned: number;
    designSystemsConfigured: string[];

    // Feature flags
    routeResolutionEnabled: boolean;
    shadowDetectionEnabled: boolean;

    // Thresholds used
    thresholds: {
      reusableFileThreshold: number;
      shadowFileThreshold: number;
      shadowRouteThreshold: number;
      substantialMarkupThreshold: number;
    };
  };

  summary: {
    directAdoption: MetricWithDetails;
    effectiveAdoptionProxy: MetricWithDetails;
    shadowUsageProxy: MetricWithDetails;
    bucketBreakdown: BucketBreakdown;
    routeCoverage: RouteCoverageSummary;
  };

  byDesignSystem: DesignSystemMetricsV2[];
  byRepository: RepositoryMetricsV2[];
  byRoute?: RouteMetrics[]; // Cross-repository route aggregation

  byComponent: {
    adoption: {
      dsName: string;
      componentName: string;
      instances: number;
      filesUsedIn: number;
    }[];
    shadow: LocalComponentProfile[];
    neither: LocalComponentProfile[];
  };

  localComponentProfiles: LocalComponentProfile[];

  // Classification configuration for transparency
  classificationConfig: {
    shadowSignalsEnabled: ShadowSignalType[];
    neitherHeuristicsEnabled: string[];
    transitiveRulesApplied: string[];
  };

  invariants?: InvariantReport;
}

// ─── Classification Configuration ─────────────────────────────────────────────

/**
 * Configuration for shadow signal detection.
 */
export interface ShadowSignalConfig {
  type: ShadowSignalType;
  enabled: boolean;
  threshold?: number;
  minStrength?: SignalStrength;
}

/**
 * Configuration for neither heuristics.
 */
export interface NeitherHeuristicConfig {
  name: string;
  enabled: boolean;
  patterns: RegExp[];
  maxJsxElements?: number;
}

// ─── Invariant Check Types ────────────────────────────────────────────────────

/**
 * Result of invariant check.
 */
export interface InvariantCheck {
  name: string;
  passed: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Collection of invariant checks for a report.
 */
export interface InvariantReport {
  allPassed: boolean;
  checks: InvariantCheck[];
  timestamp: string;
}
