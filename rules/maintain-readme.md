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

A concise repo tree as a fenced code block. Exclude `.venv/`, `node_modules/`, `_data/`, `__pycache__/`, `.git/`, `dist/`, `build/`. Highlight directories and key files that matter for understanding the project — not exhaustive. The tree is illustrative; adapt it to the project's actual layout.

```
project/
├── src/
│   └── package/
│       ├── loader/
│       └── processor/
├── tests/
└── <manifest>        # e.g. pyproject.toml, package.json, go.mod
```

## How to Run

Numbered steps to set up and run the main parts of the workflow. Include:
- Dependency installation (e.g. `uv sync`, `npm install`, `go mod download`)
- Environment setup (`.env` files, credentials, secrets)
- How to run the primary entry points
- How to test or validate the main features

**Style:** write the tree as a ` ``` ` fenced code block. Keep each section concise — this is reference documentation, not a tutorial.
