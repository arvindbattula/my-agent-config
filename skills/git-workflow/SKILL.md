---
name: git-workflow
description: "Guides git commit discipline and branching strategy. Use when committing code, creating branches, writing commit messages, or managing version history. Use when changes are accumulating without commits, or when commit history needs to be clean for review."
---

# Git Workflow and Versioning

Trunk-based development with atomic commits. Short-lived branches, small commits, clean history. Every commit does one thing and leaves the codebase in a working state.

## When to Use

- Committing any code change
- Creating or managing branches
- Writing commit messages
- Reviewing commit history before a PR
- Debugging a regression (git bisect)

## Trunk-Based Development

```
main ──●──●──●──●──●──●──●──●──  (always deployable)
        ╲      ╱  ╲    ╱
         ●──●─╱    ●──╱    ← short-lived branches (1-3 days)
```

Dev branches are costs. Every day a branch lives, it accumulates merge risk. Keep them short-lived.

## The Commit Cycle

```
Implement slice → Test → Verify → Commit → Next slice

NOT: Implement everything → Hope it works → Giant commit
```

## Atomic Commits

Each commit does ONE thing:

```
Good:
a1b2c3d feat: add task creation endpoint with validation
d4e5f6g feat: add task creation form component
h7i8j9k feat: connect form to API and add loading state
m1n2o3p test: add task creation tests (unit + integration)

Bad:
x1y2z3a Add task feature, fix sidebar, update deps, refactor utils
```

**Size targets:**
- ~100 lines → Easy to review, easy to revert
- ~300 lines → Acceptable for a single logical change
- ~1000 lines → Too large. Split it.

## Commit Message Format

```
<type>: <short description>

<optional body explaining why, not what>
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

**Rules:**
- First line: imperative, standalone, under 72 characters
- Body: explains WHY, not WHAT (the diff shows what)
- Don't mix formatting/refactoring changes with behavior changes

## Branch Naming

```
feature/<short-description>    → feature/task-creation
fix/<short-description>        → fix/duplicate-tasks
chore/<short-description>      → chore/update-deps
refactor/<short-description>   → refactor/auth-module
```

## Pre-Commit Checklist

```bash
git diff --staged                                                  # Review what you're committing
git diff --staged | grep -i "password\|secret\|api_key\|token"    # Secrets check
npm test                                                           # Tests pass?
npm run lint                                                       # Linting?
npx tsc --noEmit                                                   # Type checking?
```

## Change Summary Pattern

After making changes, communicate clearly:

```
CHANGES MADE:
- src/routes/tasks.ts: Added validation middleware
- src/lib/validation.ts: Added TaskCreateSchema

THINGS I DIDN'T TOUCH (intentionally):
- src/routes/auth.ts: Has similar validation gap but out of scope
- src/middleware/error.ts: Error format could be improved (separate task)

POTENTIAL CONCERNS:
- The Zod schema is strict — rejects extra fields. Confirm desired.
```

## Save Point Pattern

```
Agent starts work
    ├── Makes a change
    │   ├── Test passes? → Commit → Continue
    │   └── Test fails? → Revert to last commit → Investigate
    ├── Makes another change
    │   ├── Test passes? → Commit → Continue
    │   └── Test fails? → Revert to last commit → Investigate
    └── Feature complete → All commits form clean history
```

## Git for Debugging

```bash
# Find which commit introduced a bug
git bisect start
git bisect bad HEAD
git bisect good <known-good-sha>
git bisect run npm test -- --grep "failing test"

# What changed recently?
git log --oneline -20
git diff HEAD~5..HEAD -- src/

# Who last changed each line?
git blame src/services/task.ts

# Search commit messages
git log --grep="validation" --oneline
```

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll commit when the feature is done" | One giant commit is impossible to review, debug, or revert. Commit per slice. |
| "The message doesn't matter" | Commit messages are documentation. Future you reads them when debugging. |
| "I'll squash it all later" | Squashing destroys the development narrative. Atomic commits from the start. |
| "These changes are too small to commit separately" | Small commits are free. Large commits hide bugs and make rollbacks painful. |
| "This refactor is small enough to include" | Refactors mixed with features make both harder to review. Separate them. |

## Red Flags

- Large uncommitted changes accumulating
- Commit messages like "fix", "update", "misc", "WIP"
- Formatting changes mixed with behavior changes
- Committing node_modules/, .env, or build artifacts
- No `.gitignore` in the project
- Long-lived branches diverging significantly from main
- Force-pushing to shared branches

## Verification

After committing:

- [ ] Each commit does one logical thing
- [ ] Commit messages follow `<type>: <description>` format
- [ ] No secrets in committed code (`git diff --cached | grep -i secret`)
- [ ] Tests pass after each commit
- [ ] Build succeeds
- [ ] No unrelated changes mixed in

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
