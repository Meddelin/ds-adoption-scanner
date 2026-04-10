import { defineConfig } from './src/index.js';

export default defineConfig({
  repositories: [
    // ant-design-pro - real project using Ant Design
    '../ant-design-pro',
  ],

  designSystems: [
    {
      name: 'Ant Design',
      packages: [
        'antd',
        '@ant-design/pro-components',
        '@ant-design/icons',
        '@ant-design/pro-layout',
        '@ant-design/pro-table',
        '@ant-design/pro-form',
      ],
      // Pre-scan Ant Design source for component families
      path: '../ant-design',
      groupBy: 'directory',
    },
  ],

  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: [
    '**/node_modules/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.d.ts',
    '**/dist/**',
    '**/build/**',
    '**/.umi/**',
    '**/.umi-production/**',
  ],

  localLibraryPatterns: [
    '@/**',  // Path alias for src/
  ],

  output: {
    format: 'table',
    verbose: true,
  },

  historyDir: './.ds-metrics',
});
