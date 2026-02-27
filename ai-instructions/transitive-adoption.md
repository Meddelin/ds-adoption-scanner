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

Read the scan JSON report. Key fields:
- `summary.adoptionRate` — current direct-only rate
- `summary.effectiveAdoptionRate` — rate with transitive (if already configured)
- `byComponent.thirdParty[]` — third-party packages used (check if any wrap the DS)
- `byComponent.localMostUsed[]` — local-library components (check `resolvedPath` for DS imports)
- `summary.designSystems[].packages` — what packages are configured as the DS

## What To Do

### Step 1: Identify third-party transitive candidates

Look at `byComponent.thirdParty`. For each package:
1. Check the package name — does it suggest a relationship with the DS?
   - `@ant-design/pro-components` → likely wraps `antd`
   - `@mui/x-data-grid`, `@mui/x-date-pickers` → MUI ecosystem extensions
   - `@chakra-ui/icons`, `@chakra-ui/pro` → Chakra UI extensions
   - `@radix-ui/themes` → wraps Radix UI primitives
2. If uncertain, check npm or GitHub: does the package list the DS as a peer dependency?
3. Estimate coverage: what fraction of the package's exported components wrap the DS?
   - 1.0 = 100% (e.g., an icon library or layout extension)
   - 0.7-0.9 = partial (mix of DS wrappers and independent components)

### Step 2: Identify local-library transitive candidates

Look at `byComponent.localMostUsed` items with `category: "local-library"`.
For each one with a `resolvedPath`:
1. Read the source file at `resolvedPath`
2. Check the imports at the top of the file — do they import from DS packages?
3. If the component renders DS components internally → it's DS-backed

### Step 3: Suggest configuration changes

For each DS-backed package found, suggest adding to `.ds-scanner.config.ts`:

```typescript
transitiveRules: [
  // Third-party: @ant-design/pro-components fully wraps antd
  {
    package: '@ant-design/pro-components',
    backedBy: 'Ant Design',
    coverage: 1.0,
  },
  // Local library with partial DS backing
  {
    package: '@company/design-tokens',
    backedBy: 'TUI',
    coverage: 0.6,  // 60% of its exports wrap TUI components
  },
],

// For local libraries: enable auto-detection via source scanning
// (reads the resolvedPath file and looks for DS imports)
transitiveAdoption: {
  enabled: true,
},
```

**Coverage guidelines:**
- `1.0` — entire package is a DS extension/wrapper (icon packs, layout helpers, pro components)
- `0.8-0.9` — most components wrap DS, a few are independent
- `0.5-0.7` — mixed: roughly half wrap DS, half are custom
- `< 0.5` — mostly custom, minor DS dependency — may not be worth declaring

### Step 4: Project the impact

After suggesting the rules, calculate the expected change:

```
current direct adoption:    adoptionRate (from report)
transitive_instances:       sum of instances for all matched packages
estimated_weighted:         transitive_instances × avg_coverage

new_effective_adoption ≈ (DS + estimated_weighted) /
                          (DS + local-lib + local + third-party-with-rule) × 100
```

## Response Format

1. **Transitive candidates found** — list of packages with justification and suggested coverage
2. **Suggested config block** — ready-to-paste `transitiveRules` configuration
3. **Projected impact** — estimated `effectiveAdoptionRate` after applying the rules
4. **Verification steps** — how to confirm: re-run scanner and compare Direct vs Effective

## Example Output

```
Transitive candidates found:
1. @ant-design/pro-components (312 instances, 28 components)
   → Listed as antd wrapper in its README, requires antd as peer dependency
   → Suggested: { package: '@ant-design/pro-components', backedBy: 'Ant Design', coverage: 1.0 }

Suggested config:
  transitiveRules: [
    { package: '@ant-design/pro-components', backedBy: 'Ant Design', coverage: 1.0 }
  ]

Projected impact:
  Current direct adoption: 41.2%
  With transitiveRules:    68.4%  (+27.2 percentage points)
  Gap explained by:        312 ProComponents usages now credited to Ant Design
```
