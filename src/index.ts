// Public API for programmatic use
export { defineConfig } from './config/schema.js';
export { loadConfig } from './config/loader.js';
export { runScan } from './scanner/orchestrator.js';
export type {
  DSScannerConfig,
  DesignSystemDef,
  FamilyGroupBy,
  OutputConfig,
  ThresholdConfig,
  ResolvedConfig,
} from './config/schema.js';
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
