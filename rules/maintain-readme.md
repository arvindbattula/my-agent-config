---
name: maintain-readme
description: Keep README.md current whenever significant project changes are made
metadata:
  type: feedback
---

After making changes that affect project structure, add new modules/scripts, or change how the project is run, update `README.md` in the project root to reflect the current state.

**When to update:** new directories or packages added, existing modules significantly changed in purpose, run/test instructions change, dependencies change.

**When NOT to update:** minor bug fixes, refactors that don't change the public interface or structure, changes inside an existing module that don't affect how it's used.

**README.md structure to maintain:**

## Overview

One paragraph describing the business problem this project solves and what it does. Do not describe implementation details — describe the problem and the solution at a user level.

## Project Structure

A concise repo tree as a fenced code block. Exclude `.venv/`, `_data/`, `__pycache__/`, `.git/`, `dist/`. Highlight directories and key files that matter for understanding the project — not exhaustive.

```
project/
├── src/
│   └── package/
│       ├── loader/
│       └── predictor/
├── _data/          # gitignored
└── pyproject.toml
```

## How to Run

Numbered steps to set up and run the main parts of the workflow. Include:
- Environment setup (uv sync, .env, secrets)
- How to run the primary entry points
- How to test or validate the main features

**Style:** write the tree as a ` ``` ` fenced code block. Keep each section concise — this is reference documentation, not a tutorial.
