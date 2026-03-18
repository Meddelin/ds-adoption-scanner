# Codex Project Context

This file is a persistent short context for fast task startup in this repo.

## 1) What this project is

- Product: `ds-adoption-scanner` CLI.
- Goal: scan React/TypeScript repositories and measure design-system adoption.
- Runtime: Node.js >= 18, TypeScript strict mode.
- Build: `tsup` (ESM + CJS).
- CLI entry: `src/cli.ts`.

## 2) Pipeline map (where to edit)

1. Discovery: `src/scanner/file-discovery.ts`
2. Parse/JSX extraction: `src/scanner/parser.ts`, `src/scanner/jsx-extractor.ts`
3. Import resolution: `src/scanner/import-resolver.ts`
4. Categorization: `src/scanner/categorizer.ts`
5. Transitive/family enrichment:
   `src/scanner/transitive-resolver.ts`,
   `src/scanner/library-prescan.ts`,
   `src/scanner/ds-prescan.ts`,
   `src/scanner/family-resolver.ts`
6. Metrics/report aggregation:
   `src/metrics/calculator.ts`,
   `src/metrics/aggregator.ts`
7. Output/reporters: `src/output/*.ts`

## 3) Rules that are easy to forget

- Category priority is strict and order-dependent (see `categorizer.ts`).
- HTML native and third-party are excluded from direct adoption denominator.
- Effective adoption includes transitive weighted usage.
- Parse errors must warn and continue; full scan must not abort.
- Dynamic imports and fragments are not counted as components.
- `byComponent.localMostUsed[]` must keep `resolvedPath` for AI workflows.

## 4) Baseline quality gate

- Build: `npm run build`
- Full tests: `npm run test`
- Focused tests:
  - Unit: `npm run test:unit`
  - Integration: `npm run test:integration`

Use `npm run codex:bootstrap` for a quick environment snapshot.

## 5) Mandatory docs sync (when relevant)

When a feature changes behavior or report structure, update:

- `CHANGES.md`
- `README.md`
- `ai-instructions/*.md` (if report interpretation changed)
- `ds-scanner-spec.md` (if architecture/contract changed)

## 6) Task done checklist

- Code updated and consistent with existing architecture.
- Right tests passed (targeted + broader as needed).
- Docs updated where behavior changed.
- Notes recorded in `.codex/SESSION_MEMORY.md`.
