// ─── Import Types ────────────────────────────────────────────────────────────

export interface ImportEntry {
  localName: string;      // Local name in file ("Btn")
  importedName: string;   // Original name ("Button") or "default"
  source: string;         // Module specifier ("@tui/components")
  type: 'named' | 'default' | 'namespace';
}

export type ImportMap = Map<string, ImportEntry>;

// ─── JSX Usage Types ─────────────────────────────────────────────────────────

export interface JSXUsageRecord {
  componentName: string;        // "Button", "Select.Option"
  localName: string;            // As used in code ("Btn", "DS.Button")
  importEntry: ImportEntry | null; // null for HTML or unresolved
  filePath: string;
  line: number;
  column: number;
  props: string[];              // List of prop names ["variant", "size"]
  hasSpreadProps: boolean;      // Whether {...props} spread is used
}

// ─── Parse Result Types ───────────────────────────────────────────────────────

export interface FileParseResult {
  filePath: string;
  imports: ImportMap;
  jsxUsages: JSXUsageRecord[];
  errors: string[];             // Parse errors (we never abort full scan)
}

// ─── Import Resolution Types ──────────────────────────────────────────────────

export interface ResolvedImport {
  originalSource: string;       // "@components/Button"
  resolvedPath: string | null;  // "/repo/src/components/Button/index.tsx"
  isNodeModule: boolean;
  packageName: string | null;   // null for relative, "@tui/components" for node_modules
}

// ─── Categorization Types ─────────────────────────────────────────────────────

export type ComponentCategory =
  | 'design-system'
  | 'local-library'
  | 'third-party'
  | 'local'
  | 'html-native';

export interface CategorizedUsage extends JSXUsageRecord {
  category: ComponentCategory;
  dsName: string | null;       // DS name ("TUI", "Beaver") — only for design-system
  packageName: string | null;  // For node_modules
  resolvedPath: string | null; // For local components

  // Set for local-library / third-party usages that are backed by a DS.
  // Does NOT change category — only feeds into effectiveAdoptionRate.
  transitiveDS?: {
    dsName: string;
    coverage: number;                         // 0.0–1.0
    source: 'declared' | 'auto-detected';
  };
}

// ─── Metrics Types ────────────────────────────────────────────────────────────

export interface ComponentStat {
  name: string;
  dsName: string | null;
  packageName: string | null;
  resolvedPath: string | null;
  instances: number;
  filesUsedIn: number;
  topProps: { name: string; count: number }[];
}

export interface CategoryMetrics {
  instances: number;
  uniqueComponents: number;
  topComponents: ComponentStat[];
}

export interface DesignSystemMetrics {
  name: string;
  packages: string[];
  adoptionRate: number;
  effectiveAdoptionRate: number;   // Including transitive usages backed by this DS
  instances: number;
  transitiveInstances: number;     // Count of local-lib/third-party usages backed by this DS
  transitiveWeighted: number;      // Sum of coverage values for transitive usages
  uniqueComponents: number;
  topComponents: ComponentStat[];
  filePenetration: number;
}

export interface ScanMetrics {
  adoptionRate: number;
  effectiveAdoptionRate: number;   // Direct + transitive weighted
  transitiveDS: {
    totalInstances: number;        // Count of usages with transitiveDS annotation
    weightedInstances: number;     // Sum of coverage values
    byDS: { name: string; instances: number; weightedInstances: number }[];
  };
  designSystems: DesignSystemMetrics[];
  designSystemTotal: CategoryMetrics;
  localLibrary: CategoryMetrics;
  local: CategoryMetrics;
  thirdParty: CategoryMetrics;
  htmlNative: CategoryMetrics;
  filePenetration: number;
  totalComponentInstances: number;
  filesScanned: number;
}

// ─── Report Types ─────────────────────────────────────────────────────────────

export interface DiscoveryResult {
  repository: string;
  repositoryName: string;
  files: string[];
  totalFiles: number;
}

export interface RepositoryReport {
  name: string;
  path: string;
  adoptionRate: number;
  effectiveAdoptionRate: number;
  filesScanned: number;
  designSystems: {
    name: string;
    adoptionRate: number;
    effectiveAdoptionRate: number;
    instances: number;
    transitiveInstances: number;
    uniqueComponents: number;
  }[];
  designSystemTotal: CategoryMetrics;
  localLibrary: CategoryMetrics;
  local: CategoryMetrics;
  thirdParty: CategoryMetrics;
  htmlNative: CategoryMetrics;
}

export interface ScanReport {
  meta: {
    version: string;
    timestamp: string;
    scanDurationMs: number;
    configPath: string;
    filesScanned: number;
    repositoriesScanned: number;
    designSystemsConfigured: string[];
  };

  summary: {
    adoptionRate: number;
    effectiveAdoptionRate: number;
    transitiveDS: {
      totalInstances: number;
      weightedInstances: number;
      byDS: { name: string; instances: number; weightedInstances: number }[];
    };
    totalComponentInstances: number;
    filePenetration: number;
    designSystems: {
      name: string;
      adoptionRate: number;
      effectiveAdoptionRate: number;
      instances: number;
      transitiveInstances: number;
      uniqueComponents: number;
      filePenetration: number;
    }[];
    designSystemTotal: CategoryMetrics;
    localLibrary: CategoryMetrics;
    local: CategoryMetrics;
    thirdParty: CategoryMetrics;
    htmlNative: CategoryMetrics;
  };

  byRepository: RepositoryReport[];

  byComponent: {
    designSystems: {
      name: string;
      components: ComponentStat[];
    }[];
    localMostUsed: ComponentStat[];
    thirdParty: ComponentStat[];
  };

  comparison?: {
    baselineDate: string;
    adoptionDelta: number;
    byDesignSystem: {
      name: string;
      adoptionDelta: number;
    }[];
    byRepository: {
      name: string;
      adoptionDelta: number;
      trend: 'up' | 'down' | 'stable';
    }[];
    newComponents: string[];
    removedComponents: string[];
  };
}
