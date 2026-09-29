---
name: pr-draft
description: Generate a PR description markdown file ready to paste into GitHub
---

Generate a pull request description for the current branch and write it to `pr-draft.md` in the project root.

## Steps

### 1. Gather context

Run the following to understand what's changed:

```bash
git branch --show-current          # current branch name
git log main...HEAD --oneline      # commits on this branch
git diff main...HEAD --stat        # files changed, insertions, deletions
git diff main...HEAD               # full diff for deeper analysis
```

Also run a directory tree (excluding `.venv`, `_data`, `__pycache__`, `.git`, `dist`, `node_modules`):

```bash
find . -not \( -path './.git' -prune \) \
       -not \( -path './.venv' -prune \) \
       -not \( -path './_data' -prune \) \
       -not \( -path './__pycache__' -prune \) \
       -not \( -path './dist' -prune \) \
       -not \( -path './node_modules' -prune \) \
       -print | sort | head -80
```

If `docs/spec.md` exists, read it for business context.

### 2. Draft the four sections

Use the gathered context to write each section. Do not invent details — derive everything from the diff, commit messages, and spec.

**Overview** — Answer: what business or user problem does this branch solve? One short paragraph. Draw from `docs/spec.md` if it exists; otherwise infer from commit messages and changed file names.

**Project Structure** — Render a concise tree of the repo (not exhaustive — highlight the directories and key files that matter for understanding this PR). Write it as a fenced code block (``` ``` ```) with plain indented text — not raw bash tree output.

**Summary of Changes** — List the higher-level modules, scripts, or files that were created or meaningfully updated. For each, one sentence on what it does or what changed. Group by directory if the diff spans multiple areas.

**How to Run** — Concrete steps to run or test the main parts of the workflow introduced by this branch. Include any env setup (`.env`, secrets, dependencies) the reviewer would need. If a `docs/spec.md` or existing README has run instructions, use those as a base.

**Deployment Details** — Links to anywhere the project is deployed or integrated. Look for these in `CLAUDE.md`, `docs/spec.md`, `docs/decisions.md`, `.env` (key names only, not values), README, and any infrastructure config files (`*.yml`, `*.json`, `terraform/`, `bicep/`). Common targets to surface:
- Azure resources (Databricks workspace, ML workspace, storage accounts, Function Apps, Container Apps)
- APIs or endpoints the project exposes or calls
- Dashboards, notebooks, or monitoring links
- CI/CD pipeline URLs

If a link is unknown, leave a `<!-- -->` placeholder with a hint about what type of link belongs there. Do not invent URLs.

### 3. Write the file

Write the draft to `pr-draft.md` in the project root using this template:

```markdown
## Overview

<!-- business problem and solution summary -->

## Project Structure

```
<!-- trimmed directory tree -->
```

## Summary of Changes

<!-- bullet list: module/file — what it does or what changed -->

## How to Run

<!-- numbered steps to run or test the workflow -->

## Deployment Details

<!-- links to deployed resources: Azure workspace, APIs, dashboards, pipelines -->
```

### 4. Confirm

Tell the user the file was written and remind them to:
- Fill in any `<!-- -->` placeholders left where context was ambiguous
- Delete `pr-draft.md` after pasting — it should not be committed
