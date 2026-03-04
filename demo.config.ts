import { defineConfig } from './src/index.js';
import path from 'path';

export default defineConfig({
  repositories: [
    './demo-repo',
  ],

  designSystems: [
    {
      name: 'DemoDS',
      packages: ['@demo/ui'],
      // Pre-scan DS source to discover component families
      path: './tests/fixtures/ds-source',
      groupBy: 'directory',
    },
  ],

  include: ['src/**/*.{ts,tsx}'],
  exclude: ['**/node_modules/**', '**/*.test.*'],
  localLibraryPatterns: [],

  output: {
    format: 'table',
    verbose: false,
  },

  historyDir: './.ds-metrics',
});
