# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository is a spec-driven project: `ds-scanner-spec.md` defines everything. The tool to build is **DS Adoption Scanner** — a CLI that scans 10+ React/TypeScript repos, categorizes JSX component usage by source (design system / local library / custom / third-party / HTML), and calculates adoption rate.

## Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js >= 18
- **Build**: `tsup` (ESM + CJS output)
- **CLI framework**: `commander`
- **AST parsing**: `@typescript-eslint/typescript-estree`
- **Module resolution**: TypeScript API (`ts.resolveModuleName`, `ts.readConfigFile`)
- **File discovery**: `fdir` + `picomatch`
- **Output**: `cli-table3`, `chalk`, `ora`

## Build & Development Commands

*(Project not yet scaffolded — these are the expected commands once built:)*

```bash
npm run build          # tsup build (ESM + CJS)
npm run dev            # tsup --watch
npm run test           # vitest or jest
npm run test:unit      # tests/unit/
npm run test:integration  # tests/integration/
npm run lint           # eslint + tsc --noEmit
```

## Architecture

The scanner runs a 5-stage pipeline:

1. **File Discovery** (`scanner/file-discovery.ts`) — `fdir` crawls repos, `picomatch` applies include/exclude patterns. Returns `Map<repo, file[]>`.

2. **Parse & Extract** (`scanner/parser.ts`, `scanner/jsx-extractor.ts`) — `@typescript-eslint/typescript-estree` parses each file. Two-pass AST walk: first builds `ImportMap` (localName → ImportEntry), then collects `JSXUsageRecord[]` with component names, props, and spread detection.

3. **Import Resolution** (`scanner/import-resolver.ts`) — Resolves relative/aliased imports to real file paths via TypeScript API. Node_modules are identified by package name extraction. Results cached per `${source}::${containingFile}`. One TS resolver instance per repo.

4. **Categorization** (`scanner/categorizer.ts`) — Priority order:
   1. Lowercase name → `html-native`
   2. No importEntry → `local`
   3. Source matches `designSystems[].packages` → `design-system` (first match wins, dsName set)
   4. Source/resolvedPath matches `localLibraryPatterns` → `local-library`
   5. Non-relative import → `third-party`
   6. Otherwise → `local`

5. **Metrics** (`metrics/calculator.ts`, `metrics/aggregator.ts`) — Adoption formula:
   ```
   adoption_rate = total_DS / (total_DS + local_library + local) × 100
   ```
   HTML native and third-party are **excluded** from the denominator.

## Key Data Types

Core types live in `src/types.ts`. The canonical output format is `ScanReport` (JSON), which includes `meta`, `summary` (with per-DS breakdown), `byRepository[]`, and `byComponent`. See spec for full interface definitions.

## Configuration

Users configure via `.ds-scanner.config.ts` using `defineConfig()`. Key fields: `repositories[]`, `designSystems[]` (name + packages), `localLibraryPatterns[]`, `include/exclude` globs, `output`, `thresholds`, `historyDir`.

## CLI Commands & Exit Codes

```bash
ds-scanner analyze [--config] [--format table|json|csv] [--output path] [--verbose] [--min-adoption N] [--compare path] [--save-history]
ds-scanner config [--path]
ds-scanner compare <baseline.json> <current.json>
ds-scanner init
```

Exit codes: `0` success, `1` adoption below threshold, `2` config error, `3` critical scan error.

## AI Instructions Layer

Static `.md` files shipped with the package under `ai-instructions/` (included in npm via `package.json` `files` field):
- `shadow-detection.md` — find local components that duplicate DS components
- `categorization.md` — help re-categorize ambiguous components
- `report.md` — generate analytical report for stakeholders

CLI prints path to these files after every scan so users can point their AI agent at them.

## Implementation Order

Follow the phased plan in the spec (section "Порядок реализации"):
- **Phase 1**: `types.ts` → config → file-discovery → parser/extractor → import-resolver → categorizer → metrics → orchestrator → reporters → `cli.ts`
- **Phase 2**: AI instructions `.md` files → history → CSV reporter → `compare`/`init` commands
- **Phase 3**: Unit tests + fixtures + integration test

## Edge Cases

See spec section "Важные edge cases":
- Parse errors → log warning, continue (never abort full scan)
- Circular re-exports → use `visited` set to prevent infinite loops
- Dynamic imports (`lazy(() => import(...))`) → do NOT count as JSX usage
- Fragment syntax (`<>`, `<React.Fragment>`) → do NOT count as component
- Compound components (`<Select.Option>`) → count as separate component, attribute to Select's package
- `localMostUsed` in JSON output must include `resolvedPath` so AI agents can locate source files

## Performance

- Files within a repo: parallel via `Promise.all` with concurrency limit (8–16)
- Between repos: sequential (one TS resolver per repo)
- File-level cache: SHA-256 hash → cached `FileParseResult` stored in `${historyDir}/.cache/file-hashes.json`
