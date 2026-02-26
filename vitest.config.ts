import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      // Allow importing src files without .js extension in tests
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
});
