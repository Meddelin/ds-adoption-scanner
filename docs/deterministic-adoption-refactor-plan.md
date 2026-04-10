# Deterministic Adoption Refactor Plan

> Design document for refactoring DS Adoption Scanner to support deterministic Beaver analytics model.
> Phase: 0 — Design

---

## 1. Current State

### 1.1 Architecture Overview

Current pipeline (5 stages + pre-scans):

```
Pre-scan DS → Pre-scan Libraries → File Discovery → Parse/Extract → 
Import Resolution → Categorization → Transitive Enrichment → 
Family Resolution → Metrics Aggregation → Reporting
```

### 1.2 Current Types

**Structural Categories** (`ComponentCategory`):
- `design-system` — component from configured DS
- `local-library` — local shared library (potentially DS-backed)
- `third-party` — external npm package
- `local` — custom components
- `html-native` — native HTML tags

**Current Metrics**:
- `adoptionRate` — DS / (DS + local-library + local[config]) × 100
- `effectiveAdoptionRate` — (DS + transitive local-library) / same denominator × 100

**Key Issue**: Current `effectiveAdoptionRate` is a structural proxy, not factual adoption. The `coverage` parameter in `transitiveDS` is NOT used in calculations (bug).

### 1.3 Current Report Structure

```typescript
ScanReport {
  meta: ScanMeta;
  summary: {
    adoptionRate, effectiveAdoptionRate,
    transitiveDS: { totalInstances, weightedInstances, byDS[] },
    designSystems: DesignSystemSummary[],
    designSystemTotal, localLibrary, localReusable, localUnique,
    thirdParty, htmlNative: CategoryMetrics
  };
  byRepository: RepositoryReport[];
  byComponent: ComponentBreakdown;
  localReuseAnalysis: LocalReuseReport;
  // Optional: libraryPrescan, dsPrescan, comparison
}
```

### 1.4 Identified Problems

1. **No route-level aggregation** — all metrics are repository-level only
2. **No analytical classification** — only structural categories exist
3. **Effective adoption is misleading** — named as if it's factual adoption
4. **No Shadow Usage detection** — no systematic way to identify parallel UI layer
5. **Transitive coverage bug** — coverage parameter not used in calculations
6. **No "Neither" bucket** — utility/business wrappers pollute metrics

---

## 2. Target Analytical Model

### 2.1 Core Concept: Analytical Buckets

All usages/components must fall into exactly one of three **mutually exclusive** buckets:

| Bucket | Description | Examples |
|--------|-------------|----------|
| **Adoption** | Confirmed DS usage | Direct DS components, DS-backed thin wrappers |
| **Shadow Usage** | Parallel local UI layer | Reusable local UI, local UI families, substantial local components |
| **Neither** | Utility/business layer | Business wrappers, data fetching components, utility functions |

### 2.2 Measurement Dimensions

| Dimension | Type | Description |
|-----------|------|-------------|
| **Direct Adoption** | Exact | Reliable lower-bound of Beaver usage |
| **Effective Adoption Proxy** | Proxy | Extended structural metric via DS-backed wrappers |
| **Shadow Usage Proxy** | Proxy | Deterministic signal of parallel local UI |
| **Neither** | Exact | Explicitly excluded from adoption/shadow metrics |

### 2.3 Aggregation Levels

1. **Usage-level** — each JSX usage classified
2. **Component-level** — local component profile with signals
3. **Route-level** — metrics per route (primary focus)
4. **Repository-level** — aggregated from route-level
5. **Overall** — cross-repository summary

---

## 3. Proposed Domain Model

### 3.1 New Types

```typescript
// Analytical classification (mutually exclusive)
type AnalyticalBucket = 'adoption' | 'shadow' | 'neither';

// Classification confidence/provenance
type ClassificationSource = 
  | 'direct-ds'           // Direct DS usage
  | 'ds-backed-wrapper'   // Library pre-scan confirmed
  | 'transitive-declared' // Config transitive rule
  | 'transitive-auto'     // Auto-detected transitive
  | 'local-ui-signal'     // Shadow usage signal
  | 'utility-heuristic'   // Neither heuristic
  | 'unclassified';       // Default (should not happen)

// Usage with analytical classification
interface ClassifiedUsage extends CategorizedUsage {
  analyticalBucket: AnalyticalBucket;
  classificationSource: ClassificationSource;
  classificationConfidence: 'high' | 'medium' | 'low';
  shadowSignals?: ShadowSignal[];
}

// Shadow usage signals (deterministic only)
interface ShadowSignal {
  type: 'reusable-local' | 'multi-route' | 'ui-family' | 
        'substantial-markup' | 'parallel-layer' | 'primitive-like';
  strength: 'strong' | 'moderate' | 'weak';
  evidence: string; // explainable evidence
}

// Local component profile
interface LocalComponentProfile {
  componentName: string;
  resolvedPath: string;
  usages: ClassifiedUsage[];
  structuralCategory: 'local' | 'local-library';
  
  // Shadow signals
  fileCount: number;
  routeCount: number;
  hasSignificantMarkup: boolean;
  isPrimitiveLike: boolean;
  isUtilityLike: boolean;
  
  // Final classification
  analyticalBucket: AnalyticalBucket;
  primaryShadowSignal?: ShadowSignal['type'];
}
```

### 3.2 Route-Level Types

```typescript
interface RouteMatch {
  routeId: string;           // normalized route identifier
  routeKey: string;          // original key from file path
  filePath: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'nextjs' | 'react-router' | 'path-pattern' | 'fallback';
  pattern?: string;          // matched pattern
}

interface RouteMetrics {
  routeId: string;
  routeKey: string;
  confidence: 'high' | 'medium' | 'low';
  
  // Bucket counts
  adoption: { instances: number; components: number; };
  shadow: { instances: number; components: number; };
  neither: { instances: number; components: number; };
  
  // Detailed metrics
  directAdoption: { instances: number; percentage: number; };
  effectiveAdoptionProxy: { instances: number; percentage: number; };
  shadowUsageProxy: { instances: number; percentage: number; };
  
  // Component breakdown
  components: {
    adoption: string[];  // component names
    shadow: string[];
    neither: string[];
  };
  
  // Warnings
  warnings?: string[];
}
```

### 3.3 New Report Structure (V2)

```typescript
interface ScanReportV2 {
  version: '2.0';
  meta: ScanMetaV2;
  
  // Overall summary
  summary: {
    directAdoption: MetricWithDetails;
    effectiveAdoptionProxy: MetricWithDetails;
    shadowUsageProxy: MetricWithDetails;
    bucketBreakdown: BucketBreakdown;
    routeCoverage: RouteCoverageSummary;
  };
  
  // Per-design-system metrics
  byDesignSystem: DesignSystemMetricsV2[];
  
  // Per-repository metrics
  byRepository: RepositoryMetricsV2[];
  
  // Per-route metrics (NEW)
  byRoute?: RouteMetrics[];
  
  // Component analysis
  byComponent: {
    adoption: ComponentProfile[];
    shadow: LocalComponentProfile[];
    neither: LocalComponentProfile[];
  };
  
  // Local component profiles
  localComponentProfiles: LocalComponentProfile[];
  
  // Classification explanation
  classificationConfig: ClassificationConfig;
}

interface MetricWithDetails {
  percentage: number;
  instances: number;
  components: number;
  isProxy: boolean;
  denominator: { instances: number; components: number; };
  formula: string;
}

interface BucketBreakdown {
  adoption: BucketStats;
  shadow: BucketStats;
  neither: BucketStats;
}
```

---

## 4. Proposed Route Resolution Architecture

### 4.1 Design Principles

1. **Extensible, not universal** — framework-aware adapters with clear patterns
2. **Confidence markers** — every route match has confidence level
3. **Graceful fallback** — works even with partial route mapping
4. **Explainable** — provenance tracking for all route assignments

### 4.2 Route Resolver Interface

```typescript
interface RouteResolver {
  name: string;
  detect(repoPath: string): Promise<boolean>;
  resolve(filePath: string): Promise<RouteMatch | null>;
}

interface RouteResolutionResult {
  filePath: string;
  routeMatch: RouteMatch | null;
  fallback: boolean;
}
```

### 4.3 Built-in Resolvers

| Resolver | Framework | Detection | Confidence |
|----------|-----------|-----------|------------|
| `NextJsResolver` | Next.js | `pages/` or `app/` directory | High |
| `ReactRouterResolver` | React Router | Route config files | Medium |
| `PathPatternResolver` | Generic | Configurable patterns | Medium |
| `FallbackResolver` | Any | Directory-based grouping | Low |

### 4.4 Route Key Extraction

```typescript
// Next.js examples
pages/index.tsx → route: "/"
pages/about.tsx → route: "/about"
pages/blog/[slug].tsx → route: "/blog/:slug"
app/dashboard/page.tsx → route: "/dashboard"

// React Router examples
<Route path="/users" /> → route: "/users"

// Fallback (directory-based)
src/features/auth/Login.tsx → route: "features/auth"
```

---

## 5. Proposed Metric Formulas

### 5.1 Denominator Definition

```
Denominator = Adoption + Shadow + Neither
            = All classified component instances
            
Excluded from denominator:
- HTML native elements (div, span, etc.)
- Third-party non-UI components (if identifiable)
```

### 5.2 Direct Adoption

```
Direct Adoption % = Direct DS Instances / (Adoption + Shadow + Neither) × 100

Direct DS Instances:
- category === 'design-system'
- classificationSource === 'direct-ds'
```

### 5.3 Effective Adoption Proxy

```
Effective Adoption Proxy % = (Direct DS + DS-backed Wrappers) / Denominator × 100

DS-backed Wrappers:
- category === 'local-library' | 'third-party'
- transitiveDS exists
- classificationSource === 'ds-backed-wrapper' | 'transitive-declared' | 'transitive-auto'
- Weighted by transitiveDS.coverage (bug fix!)

Weighted count = Σ(coverage_i) for each wrapper instance
```

### 5.4 Shadow Usage Proxy

```
Shadow Usage Proxy % = Shadow Instances / Denominator × 100

Shadow Instances:
- analyticalBucket === 'shadow'
- classificationSource === 'local-ui-signal'
```

### 5.5 Bucket Breakdown

```
Adoption % = Adoption Instances / Denominator × 100
Shadow % = Shadow Instances / Denominator × 100
Neither % = Neither Instances / Denominator × 100

Check: Adoption% + Shadow% + Neither% = 100%
```

---

## 6. Refactor Plan by Phases

### Phase 0: Audit and Plan ✓
- [x] Audit current codebase
- [x] Create design document (this file)
- [ ] Create/update AGENTS.MD

### Phase 1: Domain Model Refactoring
- [ ] Add new types (`AnalyticalBucket`, `ClassifiedUsage`, `ShadowSignal`, etc.)
- [ ] Add `ScanReportV2` types alongside existing types
- [ ] Create classification layer interfaces
- [ ] Rename `effectiveAdoption` → `effectiveAdoptionProxy` in all outputs
- [ ] Fix transitive coverage bug in calculator

### Phase 2: Route-Level Architecture
- [ ] Create `src/routes/` module
- [ ] Implement `RouteResolver` interface
- [ ] Implement `NextJsResolver`
- [ ] Implement `FallbackResolver`
- [ ] Add route extraction to orchestrator
- [ ] Add route-level aggregation

### Phase 3: Deterministic Shadow Usage Model
- [ ] Create `src/classification/` module
- [ ] Implement shadow signal detection rules
- [ ] Implement `Neither` heuristics
- [ ] Implement analytical classifier
- [ ] Ensure bucket exclusivity

### Phase 4: Metrics Redesign
- [ ] Refactor calculator for new formulas
- [ ] Add route-level metrics aggregation
- [ ] Implement bucket breakdown
- [ ] Add proxy metric markers
- [ ] Add invariant checks

### Phase 5: Code Structure Refactor
- [ ] Reorganize into clear layers:
  - `src/domain/` — core types and invariants
  - `src/scanner/` — parsing and extraction
  - `src/routes/` — route resolution
  - `src/classification/` — analytical classification
  - `src/metrics/` — metric calculation
  - `src/reporting/` — output formatters
- [ ] Remove naming leaks
- [ ] Clean up legacy semantics

### Phase 6: Update Outputs and Docs
- [ ] Update JSON reporter for V2 schema
- [ ] Update table reporter with new metric names
- [ ] Update HTML reporter
- [ ] Update CSV reporter
- [ ] Update README.md
- [ ] Update AGENTS.MD
- [ ] Update ai-instructions/

### Phase 7: Testing
- [ ] Unit tests for classification rules
- [ ] Unit tests for route resolution
- [ ] Unit tests for metric formulas
- [ ] Integration tests for full pipeline
- [ ] Invariant tests (mutual exclusivity, no double counting)

---

## 7. Test Strategy

### 7.1 Unit Tests

| Module | Test Coverage |
|--------|---------------|
| Classification | Bucket assignment, signal detection, exclusivity |
| Route Resolution | Pattern matching, confidence levels, fallback |
| Metrics | Formula correctness, denominator stability |
| Invariants | Mutual exclusivity, no double counting, proxy markers |

### 7.2 Integration Tests

| Scenario | Description |
|----------|-------------|
| Full scan | End-to-end with mixed DS/local/wrapper |
| Route-level | Verify route extraction and aggregation |
| Shadow usage | Components with shadow signals |
| Neither | Utility components excluded from metrics |
| Partial routes | Graceful handling of unmapped files |

### 7.3 Invariant Tests

```typescript
// Must hold for all reports
assert(bucketExclusivity(report));  // Each usage in exactly one bucket
assert(noDoubleCounting(report));   // No instance counted twice
assert(directLTEffective(report));  // Direct <= Effective Proxy
assert(proxyMarked(report));        // All proxies have isProxy: true
assert(noSilentLoss(report));       // Unmapped routes visible in warnings
```

---

## 8. Risks / Non-Goals

### 8.1 Risks

| Risk | Mitigation |
|------|------------|
| Breaking changes to report schema | Version bump (V2), migration guide |
| Performance degradation | Benchmark before/after, optimize hot paths |
| Route detection false positives | Confidence markers, manual review hints |
| Shadow signals false positives | Conservative thresholds, explainable rules |

### 8.2 Non-Goals (Explicitly Out of Scope)

- **AI classification** — no embeddings, no LLM-based detection
- **Semantic duplicate detection** — no "is this component similar to DS"
- **Probabilistic scoring** — all rules deterministic and explainable
- **Universal framework support** — explicit adapters for common cases only
- **Massive rewrite** — evolutionary changes, not revolutionary

---

## 9. Migration Path

### For Existing Users

1. **Config compatibility** — existing configs continue to work
2. **Report schema** — opt-in to V2 via config flag initially
3. **Metric naming** — `effectiveAdoptionRate` → `effectiveAdoptionProxyRate`
4. **New fields** — additional fields in report, no removed fields in V1 mode

### Breaking Changes (V2)

- Report schema version bump to `2.0`
- `effectiveAdoptionRate` renamed to `effectiveAdoptionProxyRate`
- New required fields: `analyticalBucket`, `classificationSource`
- Route-level data structure added

---

## Appendix A: Shadow Usage Signal Rules

### Signal Types (Deterministic Only)

| Signal | Detection Rule | Strength |
|--------|----------------|----------|
| `reusable-local` | Used in >= N files | Strong |
| `multi-route` | Used across >= M routes | Strong |
| `ui-family` | Part of local UI family pattern | Moderate |
| `substantial-markup` | > X JSX elements in component | Moderate |
| `parallel-layer` | Local components form consistent layer | Moderate |
| `primitive-like` | Name matches primitive pattern | Weak |

### Neither Heuristics

| Heuristic | Detection |
|-----------|-----------|
| `utility-pattern` | Name contains "Provider", "Context", "Hook" |
| `business-wrapper` | Only passes props, no UI markup |
| `data-component` | Fetches data, renders children only |

---

## Appendix B: File Organization

```
src/
├── domain/
│   ├── types.ts           # Core types (V2)
│   ├── invariants.ts      # Invariant checks
│   └── constants.ts       # Thresholds, patterns
├── scanner/
│   ├── orchestrator.ts    # Updated with route extraction
│   ├── file-discovery.ts
│   ├── parser.ts
│   ├── jsx-extractor.ts
│   ├── import-resolver.ts
│   └── categorizer.ts     # Structural only
├── routes/
│   ├── types.ts
│   ├── resolver.ts        # Interface
│   ├── nextjs-resolver.ts
│   ├── react-router-resolver.ts
│   ├── pattern-resolver.ts
│   └── fallback-resolver.ts
├── classification/
│   ├── types.ts
│   ├── classifier.ts      # Main classifier
│   ├── shadow-signals.ts  # Signal detection
│   └── neither-heuristics.ts
├── metrics/
│   ├── calculator.ts      # New formulas
│   ├── aggregator.ts      # Route + repo aggregation
│   └── v1-compat.ts       # Backward compatibility
└── reporting/
    ├── json-reporter.ts
    ├── table-reporter.ts
    ├── html-reporter.ts
    └── csv-reporter.ts
```

---

*Document Version: 1.0*
*Created: 2026-04-10*
*Status: Draft for Review*
