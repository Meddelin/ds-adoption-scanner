import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI bundle — CJS only (avoids ESM/CJS interop issues with commander)
  {
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    platform: 'node',
    shims: false,
    banner: { js: '#!/usr/bin/env node' },
    define: {
      // Fix import.meta.url in CJS bundles (used by fdir and other ESM packages)
      'import.meta.url': '__filename',
    },
    external: ['typescript', 'jiti'],
    noExternal: [
      '@typescript-eslint/typescript-estree',
      'chalk',
      'cli-table3',
      'commander',
      'fdir',
      'ora',
      'picomatch',
    ],
  },
  // Library bundle — ESM + CJS
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    platform: 'node',
    shims: true,
    external: ['typescript', 'jiti'],
    noExternal: [
      '@typescript-eslint/typescript-estree',
      'chalk',
      'cli-table3',
      'commander',
      'fdir',
      'ora',
      'picomatch',
    ],
  },
]);
