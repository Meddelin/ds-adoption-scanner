# CLAUDE.md

This file provides guidance to Claude, Cursor, and other AI coding agents when working with code in this repository.

## Project Overview

**DS Adoption Scanner** is a CLI tool that scans React/TypeScript repositories, categorizes JSX component usage by source (design system / local library / custom / third-party / HTML), resolves framework routes, runs heuristics to detect shadow components, and calculates adoption proxy metrics.

## Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js >= 18
- **Build**: `tsup` (ESM + CJS output)
- **CLI framework**: `commander`
- **AST parsing**: `@typescript-eslint/typescript-estree`
- **Module resolution**: TypeScript API (`ts.resolveModuleName`, `ts.readConfigFile`)
- **File discovery**: `fdir` + `picomatch`
- **Output**: `cli-table3`, `picocolors`, html dashboards

## Build & Development Commands

```bash
npm install
npm run build          # tsup build (ESM + CJS)
npm run typecheck      # tsc --noEmit
npm run test           # vitest
npm run test:unit      # tests/unit/
npm run test:integration  # tests/integration/
npm run dev            # dev mode
```

## Architecture (V2)

The scanner runs a multi-stage pipeline:

1. **File Discovery** (`scanner/file-discovery.ts`) — crawls repos using `fdir`.
2. **Parse & Extract** (`scanner/parser.ts`, `scanner/jsx-extractor.ts`) — extracts `ImportMap` and `JSXUsageRecord[]`.
3. **Import Resolution** (`scanner/import-resolver.ts`) — Resolves imports to absolute file paths via TS API.
4. **Structural Categorization** (`scanner/categorizer.ts`) — Assigns category: `design-system`, `local-library`, `local`, `third-party`, `html-native`.
5. **Transitive Auto-detection** (`scanner/transitive-resolver.ts`) — Follows barrel re-exports and resolves DS usage inside utility libraries.
6. **Route Resolution** (`routes/resolver.ts`) — Maps files to application routes (React Router, Next.js).
7. **Analytical Classification** (`classification/*`) — Classifies into 3 mutually exclusive buckets: `adoption`, `shadow`, `neither`, using deterministic heuristics.
8. **Metrics & Aggregation** (`metrics/*`) — Calculates base direct metrics and proxy metrics out of a `adoption + shadow` denominator.

**See `AGENTS.md` for a comprehensive architectural breakdown and invariants.** Always refer to `AGENTS.md` before making domain changes.

## Key Data Types

Core types live in `src/domain/types.ts`.
The canonical output format is `ScanReport` (V2 JSON), which includes:
- `summary`: metrics across all repos
- `byRepository[]`: route and repo level breakdowns
- `byDesignSystem[]`: DS specific instances
- `localComponentProfiles[]`: shadow/neither signals
- `byComponent`: detailed usage

## Configuration

Users configure via `.ds-scanner.config.ts`.
Key features: `repositories[]`, `designSystems[]`, `localLibraryPatterns[]`, `transitiveAdoption`, `shadowDetection`, `routes`.

## AI Instructions Layer

Static `.md` files shipped with the package under `ai-instructions/`:
- `shadow-detection.md` — find migration candidates duplicate to DS
- `categorization.md` — clarify component classification
- `report.md` — generate an actionable analytical report
- `transitive-adoption.md` — trace and configure transitive coverage

## Documentation Rule

**After every feature implementation, always update all relevant MD files:**
- `CHANGES.md` — add a changelog entry for the new version
- `README.md` — update cli output, configuration logic
- `ai-instructions/*.md` — update if report schema changes
- `AGENTS.md` — update if architectural invariants or domain logic changes

Never break the invariants defined in `AGENTS.md`. Always run `npm test` before concluding your task.