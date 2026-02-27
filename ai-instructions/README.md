# DS Adoption Scanner — AI Instructions

These instructions help AI agents (Claude Code, Cursor, Aider, ChatGPT, etc.)
analyze design system adoption scan results.

## Available Instructions

| File | Description | When to use |
|------|-------------|-------------|
| `shadow-detection.md` | Find local components that duplicate DS components | Want to find migration candidates |
| `categorization.md` | Clarify component categorization | Scanner miscategorized a component |
| `report.md` | Analytical report with recommendations | Need a summary for team/stakeholders |
| `transitive-adoption.md` | Find libraries built on DS and configure transitiveRules | Want to account for wrapper libraries in adoption metrics |

## How to Use

1. Run the scanner: `ds-scanner analyze --output .ds-metrics/report.json`
2. Open your AI agent (Cursor, Claude Code, etc.) in the project root
3. Give it an instruction, for example:

> Read the file [path to instruction]. The scan result is in .ds-metrics/report.json.
> [Your specific question]

The agent will read the instruction, understand the data format and project structure,
and perform the analysis with full context.

## Key Report Fields

The JSON report (`report.json`) contains:

| Field | Description |
|-------|-------------|
| `summary.adoptionRate` | Direct adoption: only explicit DS imports |
| `summary.effectiveAdoptionRate` | Adoption including transitive DS usage via wrapper libraries |
| `summary.designSystems[].transitiveInstances` | How many usages are credited transitively to each DS |
| `byComponent.localMostUsed[].resolvedPath` | Absolute path to component source — use for reading the file |
| `byComponent.thirdParty[]` | Third-party packages — check if any wrap the DS |
