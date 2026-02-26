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
}

export type ResolvedConfig = Required<Omit<DSScannerConfig, 'thresholds'>> & {
  thresholds: ThresholdConfig;
};

// Helper function for user configs
export function defineConfig(config: DSScannerConfig): DSScannerConfig {
  return config;
}
