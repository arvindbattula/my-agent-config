---
name: scaffold
description: Create project scaffolding for structured AI-assisted development
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
├── spec.md          # Filled by /discover
├── plan.md          # Filled by /blueprint
├── decisions.md     # Filled by /decide
└── learnings.md     # Accumulated during /construct and /inspect
```

Initialize each file with a minimal header:

**docs/spec.md:**
```markdown
# Specification
<!-- Run /discover to fill this out -->
```

**docs/plan.md:**
```markdown
# Build Plan
<!-- Run /blueprint to fill this out -->
```

**docs/decisions.md:**
```markdown
# Architecture Decision Log
<!-- Run /decide to record decisions -->
```

**docs/learnings.md:**
```markdown
# Learnings
<!-- Accumulated across sessions during /construct and /inspect -->
```

### 3. Create CLAUDE.md

Generate a project-level CLAUDE.md with this structure:

```markdown
# [Directory Name] — Project

## What This Is
<!-- Updated after /discover -->

## Key Files
- `docs/spec.md` — What we're building and why
- `docs/plan.md` — Phased build plan
- `docs/decisions.md` — Architecture decisions with rationale
- `docs/learnings.md` — What Claude learns across sessions

## Build / Run / Test
<!-- Updated as commands become known -->

## Project Rules
<!-- Accumulated over time -->
```

### 4. Confirm and suggest next step

Tell the user what was created and suggest: "Run `/discover` to define what you're building."

If git is set up, suggest committing the scaffold.
