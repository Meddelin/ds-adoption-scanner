// Public API for programmatic use
export { defineConfig } from './config/schema.js';
export { loadConfig } from './config/loader.js';
export { runScan } from './scanner/orchestrator.js';

// V2 API (new deterministic analytical model)
export { AnalyticalClassifier, createClassificationContext } from './classification/classifier.js';
export { RouteResolutionOrchestrator, createDefaultRouteConfig } from './routes/resolver.js';
export {
  calculateMetricsV2,
  calculateRepositoryMetricsV2,
  calculateRouteMetrics,
} from './metrics/calculator-v2.js';
export { aggregateCrossRepository } from './metrics/aggregator-v2.js';

// Config types
export type {
  DSScannerConfig,
  DesignSystemDef,
  FamilyGroupBy,
  OutputConfig,
  ThresholdConfig,
  ResolvedConfig,
} from './config/schema.js';

// V1 types (existing)
export type {
  ImportEntry,
  ImportMap,
  JSXUsageRecord,
  FileParseResult,
  ResolvedImport,
  ComponentCategory,
  CategorizedUsage,
  ComponentFamily,
  DSCatalog,
  FamilyStat,
  ScanMetrics,
  DesignSystemMetrics,
  CategoryMetrics,
  ComponentStat,
  ScanReport,
  RepositoryReport,
  DiscoveryResult,
} from './types.js';

// V2 types (new analytical model)
export type {
  AnalyticalBucket,
  ClassificationSource,
  ClassificationConfidence,
  ShadowSignal,
  ShadowSignalType,
  ClassifiedUsage,
  LocalComponentProfile,
  RouteMatch,
  RouteMetrics,
  MetricWithDetails,
  BucketStats,
  BucketBreakdown,
  DesignSystemMetricsV2,
  RepositoryMetricsV2,
  ScanReportV2,
} from './domain/types.js';

// Route types
export type {
  RouteResolver,
  RouteResolutionConfig,
  RouteExtractionResult,
} from './routes/types.js';

// Classification types
export type {
  ClassificationContext,
  ClassificationResult,
  ShadowSignalDetector,
  NeitherHeuristic,
} from './classification/types.js';
