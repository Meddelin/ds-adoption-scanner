# DS Adoption Analytical Report

## Your Role
You are a design system analyst. Write a concise, actionable report
based on the scan results.

## Context

Read the scan JSON report (V2 schema). Key sections:

### Summary metrics
- `summary.directAdoption.percentage` — direct adoption (only explicit DS imports, exact metric)
- `summary.effectiveAdoptionProxy.percentage` — adoption including transitive DS usage (proxy)
- `summary.shadowUsageProxy.percentage` — parallel local UI layer usage (proxy)
- `summary.bucketBreakdown` — breakdown of all classified usages into adoption/shadow/neither
- `summary.routeCoverage` — how many files were mapped to routes and at what confidence

### Per-DS breakdown
- `byDesignSystem[]` — adoption per DS:
  - `.directAdoption.percentage` — direct rate for this DS
  - `.effectiveAdoptionProxy.percentage` — effective rate including transitive
  - `.instances` — direct usage count
  - `.transitiveInstances` — weighted transitive count
  - `.uniqueComponents` — distinct components used
  - `.totalFamilies`, `.familiesUsed`, `.familyCoverage` — family coverage (if DS was pre-scanned)
  - `.topComponents[]` — top components by instance count

### Per-repository breakdown
- `byRepository[]` — per-repo metrics:
  - `.directAdoption.percentage` / `.effectiveAdoptionProxy.percentage`
  - `.shadowUsageProxy.percentage`
  - `.bucketBreakdown` — adoption/shadow/neither counts
  - `.routes[]` — route-level breakdown (if route resolution enabled)
    - `.routeId` — normalized route path (e.g. `/dashboard`)
    - `.resolver` — which resolver found it (`react-router` | `nextjs-pages` | `nextjs-app` | `path-pattern` | `fallback-directory`)
    - `.directAdoption.percentage` / `.effectiveAdoptionProxy.percentage`
    - `.buckets` — adoption/shadow/neither counts per route

### Local component profiles
- `localComponentProfiles[]` — local components with classification details:
  - `.componentName`, `.resolvedPath` — component identity
  - `.analyticalBucket` — `shadow` or `neither`
  - `.signals[]` — shadow signals: `{type, strength, evidence, value?}`
  - `.fileCount`, `.routeCount` — usage breadth
  - `.hasSignificantMarkup`, `.isPrimitiveLike`, `.isUtilityLike`

### Classified components by bucket
- `byComponent.adoption[]` — DS components in use (`dsName`, `componentName`, `instances`, `filesUsedIn`)
- `byComponent.shadow[]` — shadow candidates (same structure as `localComponentProfiles`)
- `byComponent.neither[]` — utility wrappers (same structure as `localComponentProfiles`)

### Pre-scan data (when configured)
- `dsPrescan[]` — per-DS catalog: `dsName`, `totalFamilies`, `totalComponents`
- `libraryPrescan[]` — per-library: `package`, `backedBy`, `totalFamilies`, `dsBackedFamilies`,
  `transitiveUsages`, `chain?`

### Invariants (quality marker)
- `invariants.allPassed` — if false, the report has consistency issues; check `invariants.checks[]`

---

## What to Include in the Report

1. **Overall Assessment** (1-2 sentences)
   Is adoption healthy? Benchmarks: >60% Year 1 — good, >80% — mature.
   If `directAdoption.percentage` < 60% but `effectiveAdoptionProxy.percentage` > 70%,
   note that DS is well-adopted through wrappers.

2. **Family Coverage** (only when `dsPrescan` is present)
   State the coverage: "Teams use X of Y DS families (Z%)."
   Benchmarks: >50% — good breadth, >75% — comprehensive.
   List unused families if coverage < 50%.

3. **Direct vs Effective Adoption**
   Compare `directAdoption.percentage` and `effectiveAdoptionProxy.percentage`.
   Explain the gap: which packages contribute transitively and how many instances.
   If they're equal (no transitive config), skip this section.

4. **Per-DS Breakdown**
   How is each DS used? Where is it stronger/weaker?
   Use `byDesignSystem[].directAdoption.percentage` and `.effectiveAdoptionProxy.percentage`.

5. **Shadow Usage** (if `shadowUsageProxy.percentage` > 5%)
   How significant is the parallel UI layer?
   Name top shadow candidates from `byComponent.shadow[]` sorted by `fileCount`.
   Explain which signals triggered classification (from `.signals[].evidence`).

6. **Key Findings** (3-5 points)
   Specific conclusions from the data, not generic phrases.

7. **Underperforming Repositories**
   Who is lagging? Check `byRepository[].directAdoption.percentage`.
   What local components are dragging the rate down?

8. **Quick Wins**
   What can be improved quickly with maximum impact on adoption.

9. **Priority Actions**
   What the team should do first (ranked by impact).

## Tone and Format
- Markdown
- For a tech lead / design system PM
- Numbers over emotions
- Specific actions over abstract recommendations
- Brief. No more than 1 page
