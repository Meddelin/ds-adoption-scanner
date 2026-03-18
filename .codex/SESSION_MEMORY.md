# Session Memory

Short rolling memory for future tasks. Keep it concise and factual.

## 2026-03-10 Baseline

- Build status: `npm run build` passed.
- Test status: `npm run test` passed (`9` files, `157` tests).
- Bootstrap status: `npm run codex:bootstrap` runs successfully.
- Scanner architecture is implemented end-to-end (`config` -> `scanner` -> `metrics` -> `output` -> `cli`).
- Repo already contains generated artifacts (`ds-report.json`, `ds-report.html`) and history under `.ds-metrics/`.
- Working agreement added:
  - `.codex/PROJECT_CONTEXT.md`
  - `.codex/TASK_PLAYBOOK.md`
  - `scripts/codex-bootstrap.mjs`
  - `npm run codex:bootstrap`

## 2026-03-18 Report metrics cleanup
- Scope: removed File Penetration and Relative usage from report metrics/visualization.
- Files touched: `src/types.ts`, `src/metrics/calculator.ts`, `src/metrics/aggregator.ts`, `src/output/table-reporter.ts`, `src/output/html-reporter.ts`, `tests/unit/calculator.test.ts`.
- Tests/checks: `npm run build`, `npm run test` (`9` files, `155` tests).
- Docs updated: `CHANGES.md`, `README.md`, `ds-scanner-spec.md`.

## 2026-03-18 Total Instances denominator alignment
- Scope: `summary.totalComponentInstances` switched to denominator-scoped counting (excluded categories are not counted).
- Files touched: `src/metrics/calculator.ts`, `src/types.ts`, `tests/unit/calculator.test.ts`.
- Tests/checks: `npm run build`, `npm run test` (`9` files, `158` tests), smoke run via `node dist/cli.cjs analyze --config demo.config.ts`.
- Docs updated: `CHANGES.md`, `README.md`, `ds-scanner-spec.md`.

## 2026-03-18 Report naming clarity
- Scope: clarified report labels for direct vs transitive instances and denominator share.
- Files touched: `src/output/table-reporter.ts`, `src/output/html-reporter.ts`, `README.md`, `ds-scanner-spec.md`, `CHANGES.md`.
- Tests/checks: `npm run build`, `npm run test`, smoke run via `node dist/cli.cjs analyze --config demo.config.ts`.

## 2026-03-18 Analyst validation docs
- Scope: added full product-analytics validation guide for metric correctness checks.
- Files touched: `docs/PRODUCT_ANALYST_VALIDATION_GUIDE.md`, `README.md`, `CHANGES.md`.
- Tests/checks: no code changes; checks not required.

## Update Template

Use this block for each completed task:

```
## YYYY-MM-DD Short title
- Scope:
- Files touched:
- Tests/checks:
- Docs updated:
- Follow-ups:
```
