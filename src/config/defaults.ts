import type { DSScannerConfig } from './schema.js';

export const DEFAULT_INCLUDE: string[] = [
  'src/**/*.{ts,tsx,js,jsx}',
];

export const DEFAULT_EXCLUDE: string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.d.ts',
];

export const DEFAULT_CONFIG: Partial<DSScannerConfig> = {
  include: DEFAULT_INCLUDE,
  exclude: DEFAULT_EXCLUDE,
  localLibraryPatterns: [],
  trackedThirdParty: [],
  tsconfig: 'tsconfig.json',
  historyDir: './.ds-metrics',
  output: {
    format: 'table',
    verbose: false,
  },
  thresholds: {},
};
