# DS Adoption Scanner — AI Instructions

These instructions help AI agents (Claude Code, Cursor, Aider, ChatGPT, etc.)
analyze design system adoption scan results.

## Available Instructions

| File | Description | When to use |
|------|-------------|-------------|
| shadow-detection.md | Find local components that duplicate DS components | Want to find migration candidates |
| categorization.md | Clarify component categorization | Scanner miscategorized a component |
| report.md | Analytical report with recommendations | Need a summary for team/stakeholders |

## How to Use

1. Run the scanner: `ds-scanner analyze --output .ds-metrics/report.json`
2. Open your AI agent (Cursor, Claude Code, etc.) in the project root
3. Give it an instruction, for example:

> Read the file [path to instruction]. The scan result is in .ds-metrics/report.json.
> [Your specific question]

The agent will read the instruction, understand the data format and project structure,
and perform the analysis with full context.
