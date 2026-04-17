# Transitive Adoption Analysis

## Your Role
You help identify which local-library and third-party packages in the codebase
are built on top of the configured design systems, and help configure
`transitiveRules` to properly account for them in the adoption metrics.

## What Is Transitive Adoption

Direct adoption counts only explicit imports from DS packages:
```tsx
import { Button } from '@mui/material';  // ← direct DS usage
```

Transitive adoption counts usage through intermediate libraries that wrap the DS:
```tsx
import { DataGrid } from '@mui/x-data-grid';  // wraps @mui/material internally
import { ProTable } from '@ant-design/pro-components';  // wraps antd internally
import { SharedButton } from '@company/ui';  // may wrap DS internally
```

Without `transitiveRules`, these are counted as `third-party` or `local-library`
and don't credit the DS in adoption metrics.

## Context

Read the scan JSON report (V2 schema). Key fields:
- `summary.directAdoption.percentage` — current direct-only rate
- `summary.effectiveAdoptionProxy.percentage` — rate with transitive (if already configured)
- `byComponent.adoption[]` — DS components in use (includes transitive when configured)
- `byComponent.neither[]` — local-library components classified as utility (check `resolvedPath` for DS imports)
- `localComponentProfiles[]` — all local component profiles with `analyticalBucket` and `resolvedPath`
- `byDesignSystem[].packages` — what packages are configured as the DS

## What To Do

### Step 1: Identify third-party transitive candidates

Look at `byComponent.thirdParty`. For each package:
1. Check the package name — does it suggest a relationship with the DS?
   - `@ant-design/pro-components` → likely wraps `antd`
   - `@mui/x-data-grid`, `@mui/x-date-pickers` → MUI ecosystem extensions
   - `@chakra-ui/icons`, `@chakra-ui/pro` → Chakra UI extensions
   - `@radix-ui/themes` → wraps Radix UI primitives
2. If uncertain, check the package's `package.json` on npm or GitHub: is the DS listed
   in `dependencies` or `peerDependencies`? The scanner will check this automatically
   when `transitiveAdoption.enabled: true`.

### Step 2: Identify local-library transitive candidates

Look at `localComponentProfiles[]` items with `analyticalBucket: "neither"` or `"shadow"`
that have a `resolvedPath`.
For each one:
1. Read the source file at `resolvedPath`
2. Check the imports at the top of the file — do they import from DS packages?
3. If it's a barrel file (index.ts), check the files it re-exports — the scanner follows
   these automatically when `transitiveAdoption.enabled: true`.
4. If the component renders DS components internally → it's DS-backed
5. With `transitiveAdoption.enabled: true` the scanner detects this automatically,
   including barrel re-export chains (e.g. `src/ui-kit/index.ts` → `./Button.tsx` → `antd`).

### Step 3: Suggest configuration changes

For each DS-backed package found, choose the best option based on source availability:

**Option A — `libraries[]` (preferred, per-component accuracy):**
Use when you can access the library's TypeScript source.
Each component is checked individually: DS-backed → coverage 1.0, not backed → 0.

```typescript
libraries: [
  // git: scanner clones automatically (--depth 1), cached in historyDir/.library-cache/
  { package: '@ant-design/pro-components', backedBy: 'Ant Design',
    git: 'https://github.com/ant-design/pro-components' },

  // path: local source already on disk (monorepo, sibling repo)
  { package: '@company/shared-ui', backedBy: 'TUI',
    path: '../shared-ui' },
],
```

**Option B — `transitiveRules` (fallback, coverage-based):**
Use when source is unavailable (private repo, compiled-only package).

```typescript
transitiveRules: [
  // no coverage: auto-detected from node_modules/package.json deps/peerDeps
  { package: '@ant-design/pro-components', backedBy: 'Ant Design' },
  // explicit coverage: manual override when package not in node_modules
  { package: '@company/legacy-ui', backedBy: 'TUI', coverage: 0.8 },
],
transitiveAdoption: { enabled: true },
```

**Why `libraries[]` is more accurate:**
If a library has 100 components and you use only 3 that are DS-backed,
`coverage: 0.3` gives +0.3 per usage instead of +1.0. With `libraries[]`,
those 3 components get coverage 1.0 and the rest get 0 — no guesswork.

**Multi-level chains (DS → LibA → LibB)**: the scanner resolves chains automatically.
If LibA wraps DS and LibB re-exports from LibA, listing both in `libraries[]` is enough —
the scanner propagates DS-backing across N levels in the prescan phase.
`libraryPrescan[].chain` in the JSON report shows detected chains, e.g. `["BeaverUI", "LibA", "LibB"]`.

**Important**: `libraries[].package` is automatically added to `localLibraryPatterns`
by the config loader. This means you do NOT need to manually add them to `localLibraryPatterns` —
doing so is redundant. It also ensures subpath imports like
`import { X } from '@company/ui/button'` are always matched.

For local paths that you manage yourself (e.g. `src/ui-kit/**`), you DO need to add them
to `localLibraryPatterns` manually — the scanner will then auto-detect DS backing via
`transitiveAdoption.enabled: true`, including barrel file re-export chains.

### Step 4: Project the impact

After suggesting the rules, calculate the expected change:

```
current direct adoption:    summary.directAdoption.percentage (from report)
transitive_instances:       sum of instances for all matched packages
estimated_weighted:         transitive_instances × avg_coverage

new_effective_adoption ≈ (DS + estimated_weighted) /
                          (adoption_instances + shadow_instances) × 100
```

Note: the denominator is `adoption + shadow` only — neither is excluded.

## Response Format

1. **Transitive candidates found** — list of packages with justification and suggested coverage
2. **Suggested config block** — ready-to-paste `transitiveRules` or `libraries` configuration
3. **Projected impact** — estimated `effectiveAdoptionProxy.percentage` after applying the rules
4. **Verification steps** — how to confirm: re-run scanner and compare Direct vs Effective

## Example Output

```
Transitive candidates found:
1. @ant-design/pro-components (28 instances, 14 components)
   → ProTable, ProForm, ProLayout import antd directly in their source
   → Recommended: libraries[] with git (per-component accuracy)

Suggested config (Option A — per-component):
  libraries: [
    { package: '@ant-design/pro-components', backedBy: 'Ant Design',
      git: 'https://github.com/ant-design/pro-components' }
  ]

Suggested config (Option B — coverage-based fallback):
  transitiveRules: [
    { package: '@ant-design/pro-components', backedBy: 'Ant Design' }
  ],
  transitiveAdoption: { enabled: true }

Projected impact:
  Current directAdoption.percentage:         68.6%
  With transitive config effectiveProxy:     79.7%  (+11.1 percentage points)
  Gap explained by:                          28 ProComponents usages now credited to Ant Design
```
