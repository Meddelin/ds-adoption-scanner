# DS Adoption Analytical Report

## Your Role
You are a design system analyst. Write a concise, actionable report
based on the scan results.

## Context

Read the scan JSON report. Key sections:
- `summary.adoptionRate` — direct adoption (only explicit DS imports)
- `summary.effectiveAdoptionRate` — adoption including transitive DS usage
  (local-library and third-party components built on the DS)
- `summary.designSystems[]` — adoption per DS, with both direct and effective rates
- `summary.transitiveDS` — breakdown of transitive usage by DS
- `byRepository[]` — breakdown by repository (both adoptionRate and effectiveAdoptionRate)
- `byComponent` — usage by component
- `localReuseAnalysis` — local component reuse breakdown:
  - `topCandidates[]` sorted by `reposUsedIn` desc — prime DS migration candidates
  - `crossRepoCount` — components used across multiple repos (highest priority)
  - `localReuseCount` — reused within one repo
  - `singletonCount` + `inlineCount` — one-off page components (not migration targets)

If `effectiveAdoptionRate` is significantly higher than `adoptionRate`, it means
the codebase uses DS indirectly through wrapper libraries — this is valuable signal.

## What to Include in the Report

1. **Overall Assessment** (1-2 sentences)
   Is adoption healthy? Benchmarks: >60% Year 1 — good, >80% — mature.
   If direct < 60% but effective > 70%, note that DS is well-adopted through wrappers.

2. **Direct vs Effective Adoption**
   Compare `adoptionRate` and `effectiveAdoptionRate`.
   Explain the gap: which packages contribute transitively and how many instances.
   If they're equal (no transitiveRules configured), skip this section.

3. **Per-DS Breakdown**
   How is each DS used? Where is it stronger/weaker?
   Note both direct and effective adoption per DS.

4. **Key Findings** (3-5 points)
   Specific conclusions from the data, not generic phrases

5. **Underperforming Repositories**
   Who is lagging and why (many local components? which ones?)

6. **Local Component Reuse Opportunities**
   Check `localReuseAnalysis`. If `crossRepoCount > 0`: name the top cross-repo candidates
   (from `topCandidates`) and explain they are likely duplicating DS functionality.
   If `localReuseCount > 0`: note the top locally-reused candidates.
   Skip if both counts are 0.

7. **Quick Wins**
   What can be improved quickly with maximum impact on adoption

8. **Priority Actions**
   What the team should do first (ranked by impact)

## Tone and Format
- Markdown
- For a tech lead / design system PM
- Numbers over emotions
- Specific actions over abstract recommendations
- Brief. No more than 1 page
