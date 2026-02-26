import { defineConfig } from 'ds-adoption-scanner';

export default defineConfig({
  repositories: [
    '/path/to/your/frontend-repo',
    // './relative/path/to/another-repo',
  ],

  designSystems: [
    {
      name: 'MUI',
      packages: [
        '@mui/material',
        '@mui/lab',
        '@mui/icons-material',
        '@mui/x-date-pickers',
      ],
    },
    // {
    //   name: 'MyDS',
    //   packages: ['@mycompany/ui', '@mycompany/icons'],
    // },
  ],

  include: ['src/**/*.{ts,tsx,js,jsx}'],

  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.d.ts',
  ],

  localLibraryPatterns: [
    // '@shared/components',
    // '@shared/components/*',
    // '**/shared/ui/**',
  ],

  output: {
    format: 'table',
    verbose: false,
  },

  historyDir: './.ds-metrics',

  // thresholds: {
  //   minAdoptionRate: 60,
  // },
});
