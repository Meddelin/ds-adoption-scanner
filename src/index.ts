// Public API for programmatic use
export { defineConfig } from './config/schema.js';
export { loadConfig } from './config/loader.js';
export { runScanV2 } from './scanner/orchestrator-v2.js';

// V2 API (deterministic analytical model)
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

// Base types
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
  CategoryMetrics,
  ComponentStat,
  DiscoveryResult,
} from './types.js';

// V2 types
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

// Output
export { formatJSONV2, writeJSONV2 } from './output/json-reporter-v2.js';
export { buildHTMLV2, writeHTMLV2 } from './output/html-reporter-v2.js';
export { printReportV2 } from './output/table-reporter-v2.js';
