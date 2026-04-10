# AGENTS.md

This file provides guidance to AI coding agents when working with the DS Adoption Scanner codebase.

## 1. Project Overview

**DS Adoption Scanner** is a CLI tool for measuring design system adoption across React/TypeScript repositories.

### Current Maturity Level

The project is transitioning from **structural categorization** to **deterministic analytical model**:

- ✅ AST parsing and JSX extraction
- ✅ Import resolution and structural categorization
- ✅ Direct adoption calculation
- ✅ Transitive adoption proxy (with known limitations)
- 🔄 **In Progress**: Route-level analytics
- 🔄 **In Progress**: Deterministic Shadow Usage detection
- 🔄 **In Progress**: Analytical buckets (Adoption / Shadow / Neither)
- ❌ AI/semantic classification (explicitly out of scope)

### Product Goal

Enable Beaver (design system) team to:
- Identify where Beaver is actually used (direct adoption)
- Detect parallel local UI layers (shadow usage proxy)
- Prioritize migration efforts by route impact
- Make data-driven investment decisions

---

## 2. Architectural Layers

### Layer 0: Domain Model (`src/domain/`)
Core types and invariants for the new analytical model.

- `AnalyticalBucket`: `'adoption' | 'shadow' | 'neither'` — mutually exclusive
- `ClassificationSource`: provenance of classification decision
- `ShadowSignal`: deterministic signal types for shadow detection
- Invariant checks for bucket exclusivity, no double counting

### Layer 1: Scanner (`src/scanner/`)
AST-based extraction and structural categorization.

| Module | Responsibility |
|--------|----------------|
| `orchestrator.ts` | Pipeline coordination, pre-scans |
| `file-discovery.ts` | fdir-based file crawling |
| `parser.ts` | AST parsing with error tolerance |
| `jsx-extractor.ts` | ImportMap + JSXUsageRecord extraction |
| `import-resolver.ts` | TS module resolution, path aliases |
| `categorizer.ts` | Structural category assignment (6 rules) |
| `transitive-resolver.ts` | Multi-case transitive DS detection |
| `family-resolver.ts` | DS family assignment |
| `ds-prescan.ts` | DS catalog building |
| `library-prescan.ts` | Library registry with per-component DS mapping |

**Key Rule**: Categorizer does ONLY structural categorization. No analytical decisions here.

### Layer 2: Route Resolution (`src/routes/`)
Framework-aware route extraction with confidence markers.

- `RouteResolver` interface for extensibility
- `NextJsResolver` — pages/ and app/ directory patterns
- `FallbackResolver` — directory-based grouping with low confidence
- Every route match has: `routeId`, `confidence`, `source`

### Layer 3: Classification (`src/classification/`)
Analytical classification into buckets.

- `classifier.ts` — main classification logic
- `shadow-signals.ts` — deterministic shadow detection rules
- `neither-heuristics.ts` — utility/business wrapper detection

Classification happens AFTER structural categorization and route resolution.

### Layer 4: Metrics (`src/metrics/`)
Formula-based metric calculation.

- `calculator.ts` — metric formulas with explicit denominators
- `aggregator.ts` — route-level and repository-level aggregation
- `v1-compat.ts` — backward compatibility layer

**Critical**: All proxy metrics must be explicitly marked with `isProxy: true`.

### Layer 5: Reporting (`src/reporting/`)
Output formatters for different consumers.

- `json-reporter.ts` — `ScanReportV2` schema
- `table-reporter.ts` — CLI output with new metric names
- `html-reporter.ts` — visual dashboard
- `csv-reporter.ts` — spreadsheet export

---

## 3. Key Domain Concepts

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
| **Direct Adoption** | Exact | Direct DS / Denominator × 100 | Reliable lower bound |
| **Effective Adoption Proxy** | Proxy | (DS + Weighted Wrappers) / Denominator × 100 | Extended structural view |
| **Shadow Usage Proxy** | Proxy | Shadow / Denominator × 100 | Parallel UI detection |

**Denominator** = Adoption + Shadow + Neither (excluding HTML native and identifiable non-UI third-party)

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

---

## 4. Rules for Changes

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
4. **Update SESSION_MEMORY.md** — Brief notes for future agents

---

## 5. Invariants (Must Always Hold)

```typescript
// 1. Buckets are mutually exclusive
∀ usage ∈ usages: usage.analyticalBucket ∈ {'adoption', 'shadow', 'neither'}
∀ usage: exactly one bucket assigned

// 2. No double counting in final metrics
Σ(buckets.instances) = total classified instances

// 3. Direct <= Effective Proxy
adoption.direct.percentage <= adoption.effectiveProxy.percentage

// 4. Proxy metrics are explicitly marked
metric.isProxy === true for all proxy metrics

// 5. Unmapped routes are visible
unmappedFiles.length > 0 → warnings include file list

// 6. Denominator is stable
denominator = adoption + shadow + neither (excluding html-native)

// 7. Structural and analytical are separate
structuralCategory assigned before analyticalBucket
no mixing of structural and analytical semantics
```

---

## 6. Quality Gates

### After Every Change

```bash
# Type check
npm run build

# Unit tests for affected area
npm run test:unit

# Integration tests if broad impact
npm run test:integration

# Full test suite before commit
npm run test
```

### Before Phase Completion

- [ ] All invariants have test coverage
- [ ] Documentation updated (README, AGENTS.MD, design doc)
- [ ] No type errors
- [ ] No test regressions
- [ ] Self-review completed

---

## 7. Common Patterns

### Adding a New Shadow Signal

1. Add signal type to `ShadowSignal` in `src/domain/types.ts`
2. Implement detection in `src/classification/shadow-signals.ts`
3. Add unit tests in `tests/unit/shadow-signals.test.ts`
4. Update classifier to use new signal
5. Document signal in design doc

### Adding a Route Resolver

1. Implement `RouteResolver` interface
2. Add to resolver registry in `src/routes/index.ts`
3. Add detection logic for your framework
4. Add tests with fixture files
5. Document supported patterns and limitations

### Changing Metric Formulas

1. Update formula in `src/metrics/calculator.ts`
2. Update `formula` string in report for transparency
3. Add/update unit tests for formula
4. Update invariant checks if needed
5. Update README with new formula explanation

---

## 8. Documentation Sync Checklist

When changing behavior, update:

| File | When to Update |
|------|----------------|
| `docs/deterministic-adoption-refactor-plan.md` | Domain model, architecture, formulas |
| `AGENTS.md` | Architectural decisions, invariants, rules |
| `README.md` | User-facing behavior, CLI output, examples |
| `ai-instructions/*.md` | Report interpretation, AI-assisted workflows |
| `CHANGES.md` | Changelog for new version |

---

## 9. Troubleshooting

### "Buckets not mutually exclusive"
Check classifier logic. Each usage must have exactly one `analyticalBucket`.

### "Proxy metric not marked"
Ensure `isProxy: true` in metric object and `formula` field explains why it's a proxy.

### "Route mapping incomplete"
Check confidence levels. Low confidence routes should have warnings.

### "Transitive coverage not applied"
Verify calculator uses `usage.transitiveDS.coverage` in weighted sum, not just count.

---

*Last Updated: 2026-04-10*
*Status: Reflects Phase 0-1 transition*
