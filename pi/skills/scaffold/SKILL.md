---
name: "scaffold"
description: "Create project scaffolding for structured AI-assisted development"
disable-model-invocation: true
---

Create the project scaffolding for structured AI-assisted development in the current working directory.

## Steps

### 1. Check existing state

Before creating anything, check:
- Does `CLAUDE.md` already exist? If so, ask before overwriting.
- Does `docs/` already exist? If so, ask before overwriting.
- Is this a git repo? Note this for later (commit recommendations).

### 2. Create the docs directory and empty files

```
docs/
├── spec.md          # Filled by /skill:discover
├── plan.md          # Filled by /skill:blueprint
├── decisions.md     # Filled by /skill:decide
└── learnings.md     # Accumulated during /skill:construct and /skill:inspect
```

Initialize each file with a minimal header:

**docs/spec.md:**
```markdown
# Specification
<!-- Run /skill:discover to fill this out -->
```

**docs/plan.md:**
```markdown
# Build Plan
<!-- Run /skill:blueprint to fill this out -->
```

**docs/decisions.md:**
```markdown
# Architecture Decision Log
<!-- Run /skill:decide to record decisions -->
```

**docs/learnings.md:**
```markdown
# Learnings
<!-- Accumulated across sessions during /skill:construct and /skill:inspect -->
```

### 3. Create CLAUDE.md

Generate a project-level `CLAUDE.md` with this structure (this repo's other ported skills — plan-build-verify, retro — already reference project-level `CLAUDE.md`, so keep that filename for consistency rather than introducing a second convention):

```markdown
# [Directory Name] — Project

## What This Is
<!-- Updated after /skill:discover -->

## Key Files
- `docs/spec.md` — What we're building and why
- `docs/plan.md` — Phased build plan
- `docs/decisions.md` — Architecture decisions with rationale
- `docs/learnings.md` — What the agent learns across sessions

## Build / Run / Test
<!-- Updated as commands become known -->

## Visualization / Plotting Style

- **Stack**: `matplotlib.pyplot` + `seaborn`, with `sns.set_style("whitegrid")`.
- **Layout**: use small multiples (one subplot per category) over a single crowded axes. Prefer a layout where every subplot sits in the bottom row rather than a grid with unused/empty panels — an empty panel can hide tick labels on the panel sharing its column.
- **Category order**: pick an explicit, meaningful order for categorical variables (e.g. domain-natural order) rather than relying on alphabetical or default ordering.
- **Color mapping**: use a fixed, reused color-per-category mapping (a dict), not auto-cycled colors — so the same category always gets the same color across plots. When a series is a forecast/extrapolation of another series, plot it in that same color but with a dashed line style, rather than introducing a new color.
- **Axes**:
  - Format numeric axes for their unit (e.g. currency formatting for monetary values) rather than leaving raw numbers.
  - Fix the tick count across panels (e.g. `MaxNLocator(nbins=...)`) so panels on very different scales still show comparable grid density.
  - For date axes, truncate/abbreviate labels and thin the tick interval so labels stay legible, center-align tick labels, and make sure every panel shows its own axis.
- **Titles/labels**: use a figure-level title (`suptitle`) for the overall chart and a per-axes title for each panel's category; don't title legends.
- **Sizing**: scale `figsize` by the number of panels so panel size stays consistent as panel count changes.
- Always finish a plotting cell with a tight/constrained layout call before displaying.

## Project Rules
<!-- Accumulated over time -->
```

### 4. Confirm and suggest next step

Tell the user what was created and suggest: "Run `/skill:discover` to define what you're building."

If git is set up, suggest committing the scaffold.
