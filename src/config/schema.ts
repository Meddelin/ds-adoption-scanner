export interface DesignSystemDef {
  name: string;       // Human-readable name for report ("TUI", "Beaver")
  packages: string[]; // npm packages belonging to this DS
}

export interface OutputConfig {
  format: 'json' | 'table' | 'csv';
  path?: string;
  verbose?: boolean;
}

export interface ThresholdConfig {
  minAdoptionRate?: number;
  maxCustomComponents?: number;
  perDesignSystem?: Record<string, { minAdoptionRate?: number }>;
}

// Declarative rule: package X is built on DS Y with coverage C.
// Works for both local-library and third-party packages.
export interface TransitiveRule {
  package: string;    // npm package name or pattern (same syntax as designSystems.packages)
  backedBy: string;   // must match one of designSystems[].name
  coverage?: number;  // 0.0–1.0, fraction of components backed by DS (default: 1.0)
}

export interface TransitiveAdoptionConfig {
  enabled?: boolean;  // auto-scan local-library source files to detect DS usage (default: false)
}

export interface DSScannerConfig {
  repositories: string[];
  designSystems: DesignSystemDef[];
  include?: string[];
  exclude?: string[];
  localLibraryPatterns?: string[];
  trackedThirdParty?: string[];
  tsconfig?: string;
  output?: OutputConfig;
  thresholds?: ThresholdConfig;
  historyDir?: string;
  transitiveRules?: TransitiveRule[];
  transitiveAdoption?: TransitiveAdoptionConfig;
}

export type ResolvedConfig = Required<Omit<DSScannerConfig, 'thresholds' | 'transitiveAdoption'>> & {
  thresholds: ThresholdConfig;
  transitiveAdoption: Required<TransitiveAdoptionConfig>;
};

// Helper function for user configs
export function defineConfig(config: DSScannerConfig): DSScannerConfig {
  return config;
}
