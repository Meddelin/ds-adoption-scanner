# AGENTS.md

This file provides guidance to AI coding agents when working with the DS Adoption Scanner codebase.

## 1. How to Run

### Prerequisites

- Node.js >= 18
- npm

### Build & Test

```bash
# Install dependencies
npm install

# Build (ESM + CJS output via tsup)
npm run build

# Type-check only (no emit)
npm run typecheck

# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode during development
npm run dev
```

### Running the Scanner (from source)

```bash
# After building:
node dist/cli.cjs analyze --config ./ant-design.config.ts

# Or use ts-node for development:
npx tsx src/cli.ts analyze --config ./ant-design.config.ts

# Available flags:
#   --config <path>     Config file path (default: .ds-scanner.config.ts)
#   --format table|json|csv   Output format (default: table)
#   --output <path>     Output file path (default: ds-report)
#   --verbose           Show parse warnings
#   --min-adoption <n>  Exit code 1 if adoption below N%
```

### Example with the bundled demo

```bash
# The repo includes a demo-crm app for testing:
node dist/cli.cjs analyze --config ./ant-design.config.ts

# Output: ds-report.json + ds-report.html
# Open ds-report.html in browser to see the visual dashboard
```

---

## 2. Project Overview

**DS Adoption Scanner** is a CLI tool for measuring design system adoption across React/TypeScript repositories.

### Current Maturity Level

The project is **feature-complete at v2.1**:

- ✅ AST parsing and JSX extraction
- ✅ Import resolution and structural categorization
- ✅ Direct adoption calculation
- ✅ Transitive adoption — barrel re-export following (auto-detects index.ts re-exports)
- ✅ Route-level analytics (React Router + Next.js + fallback)
- ✅ React Router resolver with source tracking
- ✅ Deterministic Shadow Usage detection (6 rule-based signals)
- ✅ Analytical buckets (Adoption / Shadow / Neither) with invariant checks
- ✅ HTML report with route filters, resolver filter, Effective Adoption everywhere
- ❌ AI/semantic classification (explicitly out of scope)

### Product Goal

Enable DS teams to:
- Identify where the DS is actually used (direct adoption)
- Detect parallel local UI layers (shadow usage proxy)
- Prioritize migration efforts by route impact
- Make data-driven investment decisions

---

## 3. Architectural Layers

### Layer 0: Domain Model (`src/domain/`)
Core types and invariants for the analytical model.

- `AnalyticalBucket`: `'adoption' | 'shadow' | 'neither'` — mutually exclusive
- `ClassificationSource`: provenance of classification decision
- `ShadowSignal`: deterministic signal types for shadow detection
- `invariants.ts`: bucket exclusivity, no double counting, proxy marking checks

### Layer 1: Scanner (`src/scanner/`)
AST-based extraction and structural categorization.

| Module | Responsibility |
|--------|----------------|
| `orchestrator.ts` | V1 pipeline coordination, pre-scans |
| `orchestrator-v2.ts` | V2 pipeline: route resolution + classification + metrics |
| `file-discovery.ts` | fdir-based file crawling |
| `parser.ts` | AST parsing with error tolerance |
| `jsx-extractor.ts` | ImportMap + JSXUsageRecord extraction |
| `import-resolver.ts` | TS module resolution, path aliases |
| `categorizer.ts` | Structural category assignment (6 rules) |
| `transitive-resolver.ts` | Multi-case transitive DS detection + barrel re-export following |
| `family-resolver.ts` | DS family assignment |
| `ds-prescan.ts` | DS catalog building |
| `library-prescan.ts` | Library registry with per-component DS mapping |

**Key Rule**: Categorizer does ONLY structural categorization. No analytical decisions here.

### Layer 2: Route Resolution (`src/routes/`)
Framework-aware route extraction with confidence markers.

| Module | Responsibility |
|--------|----------------|
| `resolver.ts` | `RouteResolutionOrchestrator` — coordinates all resolvers |
| `nextjs-resolver.ts` | Next.js pages/ and app/ directory patterns |
| `react-router-resolver.ts` | React Router v6 route config detection |
| `fallback-resolver.ts` | Directory-based grouping (low confidence) |

Every route match has: `routeId`, `confidence` (high/medium/low), `source` (resolver name).

Route propagation: routes found in a file propagate to all files it imports (transitively),
downgraded by one confidence level per hop. This is how shared components get route attribution.

### Layer 3: Classification (`src/classification/`)
Analytical classification into buckets, runs AFTER structural categorization + route resolution.

| Module | Responsibility |
|--------|----------------|
| `classifier.ts` | Main classification logic (two-pass) |
| `shadow-signals.ts` | Deterministic shadow detection rules |
| `source-analysis.ts` | JSX element counting for substantial-markup signal |
| `neither-heuristics.ts` | Utility/business wrapper detection |
| `types.ts` | Classification-specific types |

**Critical**: The classifier's second pass must NOT override transitive adoption usages already
classified in the first pass. Local-library usages with `analyticalBucket === 'adoption'` and
source `transitive-declared` or `transitive-auto` are skipped in the second pass.

### Layer 4: Metrics (`src/metrics/`)
Formula-based metric calculation.

| Module | Responsibility |
|--------|----------------|
| `calculator-v2.ts` | Repository + route metric formulas |
| `aggregator-v2.ts` | Cross-repository aggregation, summary |
| `calculator.ts` | V1 metric formulas (still used for V1 report) |
| `aggregator.ts` | V1 aggregation |

**Critical**: All proxy metrics must be explicitly marked with `isProxy: true`.

### Layer 5: Reporting (`src/output/`)
Output formatters for different consumers.

| Module | Responsibility |
|--------|----------------|
| `html-reporter-v2.ts` | Self-contained HTML dashboard |
| `table-reporter-v2.ts` | CLI table output (V2 metrics) |
| `index.ts` | Reporter orchestration |

---

## 4. Key Domain Concepts

### Structural Category vs Analytical Bucket

| Aspect | Structural Category | Analytical Bucket |
|--------|--------------------|--------------------|
| **What** | Where component comes from | How it contributes to metrics |
| **Values** | `design-system`, `local-library`, `local`, `third-party`, `html-native` | `adoption`, `shadow`, `neither` |
| **When assigned** | During categorization | After classification |
| **Mutually exclusive** | Yes | Yes |
| **Used for** | Import resolution, transitive detection | Final metrics, product decisions |

### Metric Types

| Metric | Type | Formula | Use Case |
|--------|------|---------|----------|
| **Direct Adoption** | Exact | Adoption / (Adoption+Shadow) × 100 | Reliable lower bound |
| **Effective Adoption Proxy** | Proxy | (Adoption + Weighted Wrappers) / (Adoption+Shadow) × 100 | Extended structural view |
| **Shadow Usage Proxy** | Proxy | Shadow / (Adoption+Shadow) × 100 | Parallel UI detection |

**Denominator** = Adoption + Shadow only. `Neither` is excluded from the metric denominator
(it's tracked in `totalClassified` for display but not in rate calculations).

### Two-Denominator Model

```
metric denominator = adoption.instances + shadow.instances
total classified   = adoption.instances + shadow.instances + neither.instances
```

Neither bucket components are tracked for transparency but do not affect adoption rates.
This is intentional: utility providers, data fetchers, etc. shouldn't dilute the adoption signal.

### Shadow Usage Signals (Deterministic Only)

| Signal | Detection | Strength |
|--------|-----------|----------|
| `reusable-local` | Used in >= N files | Strong |
| `multi-route` | Used across >= M routes | Strong |
| `ui-family` | Part of local UI family pattern | Moderate |
| `substantial-markup` | > X JSX elements in component | Moderate |
| `parallel-layer` | Local components form consistent layer | Moderate |
| `primitive-like` | Name matches primitive pattern | Weak |

**No AI, no embeddings, no semantic similarity.**

### Transitive Adoption — Barrel File Re-export Following

`transitive-resolver.ts` now follows barrel re-exports automatically. When checking a
local-library component's source file for DS imports, if no DS import is found directly,
the resolver reads all `ExportNamedDeclaration` and `ExportAllDeclaration` statements and
recursively checks those re-exported source files. This handles the common pattern:

```typescript
// src/ui-kit/index.ts — barrel file
export { Button } from './Button';  // Button.tsx imports from 'antd'
```

Without this, the barrel index.ts would not be detected as DS-backed even though
`./Button.tsx` clearly imports from the DS.

---

## 5. Rules for Changes

### Before Making Changes

1. **Design first** — Update design doc if changing domain model, report schema, or classification
2. **Check invariants** — Ensure bucket exclusivity, no double counting, proxy marking
3. **Consider route-level** — New features should support both repository and route aggregation

### During Implementation

1. **Small, focused commits** — One logical change per commit
2. **Keep tests passing** — Run targeted tests after each change
3. **Explicit naming** — Use `Proxy` suffix for proxy metrics
4. **No hidden magic** — All heuristics must be explainable

### After Changes

1. **Update docs** — README, AGENTS.MD, ai-instructions/
2. **Add tests** — Unit tests for rules, integration tests for scenarios
3. **Record invariants** — Add checks for new invariants

---

## 6. Invariants (Must Always Hold)

```typescript
// 1. Buckets are mutually exclusive
∀ usage ∈ usages: usage.analyticalBucket ∈ {'adoption', 'shadow', 'neither'}
∀ usage: exactly one bucket assigned

// 2. No double counting in metric denominator
adoption.instances + shadow.instances === denominator.instances
// (neither is NOT included in the denominator — only in totalClassified)

// 3. Direct <= Effective Proxy
directAdoption.percentage <= effectiveAdoptionProxy.percentage

// 4. Proxy metrics are explicitly marked
metric.isProxy === true for all proxy metrics

// 5. Unmapped routes are visible
unmappedFiles.length > 0 → warnings include unmapped count

// 6. Structural and analytical are separate
structuralCategory assigned before analyticalBucket
no mixing of structural and analytical semantics

// 7. Transitive adoption not overridden
local-library usages with analyticalBucket==='adoption' and
source in {'transitive-declared','transitive-auto'} must not
be re-classified in the second classifier pass
```

---

## 7. Quality Gates

### After Every Change

```bash
# Type check
npm run build

# Unit tests for affected area
npm run test:unit

# Integration tests if broad impact
npm run test:integration

# Full test suite before commit
npm test
```

### Before Phase Completion

- [ ] All invariants have test coverage
- [ ] Documentation updated (README, AGENTS.MD, ai-instructions/)
- [ ] No type errors (`npm run typecheck`)
- [ ] No test regressions

---

## 8. Common Patterns

### Adding a New Shadow Signal

1. Add signal type to `ShadowSignalType` in `src/domain/types.ts`
2. Implement detection in `src/classification/shadow-signals.ts`
3. Add unit tests in `tests/unit/shadow-signals.test.ts`
4. Update classifier to use new signal
5. Document signal in `ai-instructions/shadow-detection.md`

### Adding a Route Resolver

1. Implement `RouteResolver` interface in `src/routes/`
2. Register in `RouteResolutionOrchestrator` (`src/routes/resolver.ts`)
3. Add `source` string to the `RouteMatch.source` union in `src/domain/types.ts`
4. Update `resolverLabel()` in `html-reporter-v2.ts` to render a tag for the new source
5. Add tests with fixture files
6. Document supported patterns and limitations in AGENTS.MD

### Changing Metric Formulas

1. Update formula in `src/metrics/calculator-v2.ts`
2. Update `formula` string in report for transparency
3. Add/update unit tests in `tests/unit/calculator-v2.test.ts`
4. Update invariant checks if needed
5. Update README with new formula explanation

---

## 9. Documentation Sync Checklist

When changing behavior, update:

| File | When to Update |
|------|----------------|
| `AGENTS.md` | Architectural decisions, invariants, rules, run instructions |
| `README.md` | User-facing behavior, CLI output, examples, config reference |
| `CHANGES.md` | Changelog for new version |
| `ai-instructions/report.md` | V2 JSON schema field names, metric keys |
| `ai-instructions/shadow-detection.md` | Shadow detection signals, JSON fields |
| `ai-instructions/transitive-adoption.md` | Transitive detection behavior |

---

## 10. Troubleshooting

### "Invariant: no-double-counting failed"
The denominator is `adoption + shadow`. If you see this, verify that `checkNoDoubleCounting`
is called with `(adoption.instances, shadow.instances, 0, denominator.instances)` — the `0`
is for neither (intentionally excluded). Do NOT pass `neither.instances` as the third argument.

### "Buckets not mutually exclusive"
Check classifier logic. Each usage must have exactly one `analyticalBucket`.

### "Proxy metric not marked"
Ensure `isProxy: true` in metric object and `formula` field explains why it's a proxy.

### "Route mapping incomplete"
Check confidence levels. Low confidence routes should have warnings.

### "Transitive coverage not applied / shows 0"
Two common causes:
1. **Barrel file not followed**: `transitive-resolver.ts` must follow re-exports. Check
   `extractReExportSources()` for the barrel file.
2. **Second-pass override**: classifier second pass may be overwriting transitive adoption.
   Check that the guard `usage.analyticalBucket === 'adoption' && source === 'transitive-*'`
   is in place in `classifier.ts`.

### "Effective adoption equal to direct despite transitive config"
Verify `localLibraryPatterns` includes the path where the wrapping components live
(e.g. `src/ui-kit/**`). Without this pattern, components are categorized as `local` instead
of `local-library` and the transitive check is never triggered.

---

*Last Updated: 2026-04-10*
*Status: v2.1 complete — all analytical features shipped*
