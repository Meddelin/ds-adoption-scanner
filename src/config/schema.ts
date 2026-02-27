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

// Declares that a package is (potentially) built on a design system.
// When transitiveAdoption.enabled = true, the tool auto-detects which components
// actually use DS by scanning source files in node_modules.
// Use coverage only as an override when auto-detection is not possible.
export interface TransitiveRule {
  package: string;    // npm package name or pattern (same syntax as designSystems.packages)
  backedBy: string;   // must match one of designSystems[].name
  coverage?: number;  // override: 0.0–1.0 fraction of components backed by DS.
                      // If omitted, auto-detected from source files.
                      // If source files not available, the rule is skipped (not counted).
}

export interface TransitiveAdoptionConfig {
  enabled?: boolean;  // scan source files to detect actual DS usage (default: false)
                      // For local-library: parses the component's resolvedPath file.
                      // For third-party: scans node_modules package directory.
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
  // When true, local/custom components are excluded from the adoption denominator.
  // Useful when local components are intentional product-specific blocks that are
  // not candidates for DS replacement.
  // Formula becomes: DS / (DS + local-library)
  excludeLocalFromAdoption?: boolean;
}

export type ResolvedConfig = Required<Omit<DSScannerConfig, 'thresholds' | 'transitiveAdoption'>> & {
  thresholds: ThresholdConfig;
  transitiveAdoption: Required<TransitiveAdoptionConfig>;
};

// Helper function for user configs
export function defineConfig(config: DSScannerConfig): DSScannerConfig {
  return config;
}
