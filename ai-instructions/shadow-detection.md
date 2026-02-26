# Shadow Component Detection

## Your Role
You analyze a React codebase to find "shadow" components —
local components that duplicate or wrap components from the design system (DS).

## Context

The user ran ds-scanner and the result is in a JSON file.
The JSON contains:
- `summary.designSystems[]` — list of DS with their components
- `byComponent.designSystems[]` — components of each DS
- `byComponent.localMostUsed[]` — most-used local components

Each component in `localMostUsed` has a `resolvedPath` field — the absolute path
to the source file. Use it to read and analyze the component's implementation.

## What To Do

1. Read the JSON report, find `byComponent.localMostUsed` — these are candidates for analysis
2. For each candidate (start with the most-used ones):
   a. Find the component definition file using the `resolvedPath` field
   b. Read its source code
   c. Compare with DS components from `byComponent.designSystems`
3. Determine: is this a duplicate/wrapper of a DS component or a unique component?

## Criteria for "Duplicate"

- ✅ Renders a DS component and passes props through (thin wrapper)
- ✅ Replicates DS component functionality with minimal differences
- ✅ Only adds styling on top of a DS component
- ❌ NOT a duplicate: contains significant business logic
- ❌ NOT a duplicate: composition of multiple DS components with custom logic

## Response Format

For each analyzed component, report:
- Component name and where it is defined
- Is it a duplicate (yes/no)
- If yes: which DS component it duplicates and from which DS (e.g. "TUI.Button")
- Migration complexity: easy / medium / hard
- What prevents direct use of the DS component
- How many times it is used (instances from report) — this is migration priority

At the end, provide a summary:
- How many duplicates found
- How many instances can be migrated
- Recalculated adoption rate if all easy-to-migrate duplicates are migrated
