# Codex Task Playbook

Use this workflow to avoid re-onboarding from scratch each task.

## Quick start

1. Run `npm run codex:bootstrap`.
2. Read `AGENTS.md` and `.codex/PROJECT_CONTEXT.md`.
3. Open only files in the impacted layer (scanner/metrics/output/config).
4. Define the smallest valid change and implement it.
5. Run targeted tests first, then broader tests if needed.
6. Update docs and append a short note to `.codex/SESSION_MEMORY.md`.

## Change-type matrix

### Categorization/import behavior

- Typical files:
  - `src/scanner/categorizer.ts`
  - `src/scanner/import-resolver.ts`
  - `src/scanner/transitive-resolver.ts`
- Tests to run:
  - `npm run test:unit`
  - (If broad impact) `npm run test`

### Metrics/formula/report fields

- Typical files:
  - `src/metrics/calculator.ts`
  - `src/metrics/aggregator.ts`
  - `src/types.ts`
  - `src/output/table-reporter.ts`
  - `src/output/json-reporter.ts`
  - `src/output/html-reporter.ts`
- Tests to run:
  - `npm run test:unit`
  - `npm run test:integration`
  - `npm run test`

### CLI/config behavior

- Typical files:
  - `src/cli.ts`
  - `src/config/schema.ts`
  - `src/config/loader.ts`
  - `src/config/defaults.ts`
- Tests to run:
  - `npm run test:integration`
  - `npm run test`

## Documentation trigger checklist

Update docs when behavior/output changes:

- `CHANGES.md`: user-visible change
- `README.md`: command examples, output examples, structure, test totals
- `ai-instructions/*.md`: only if interpretation/report fields changed
- `ds-scanner-spec.md`: only if contract/architecture changed

## Guardrails

- Keep non-task changes minimal.
- Do not revert unrelated dirty files.
- Prefer targeted edits over refactors unless refactor is required for correctness.
- Keep report schema backward-compatible unless explicitly requested.
