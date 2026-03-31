---
name: organize-claude-config
description: Refactor CLAUDE.md for progressive disclosure
---

Refactor my CLAUDE.md file to follow progressive disclosure principles.

Follow these steps:

### 1. Check length
Report the current line count. Flag issues:
- **Ideal**: <50 lines
- **Acceptable**: 50-100 lines
- **Needs refactoring**: >100 lines (move content to `.claude/rules/` files)

### 2. Integrate workflow orchestration
Read the task-planner skill at `~/.claude/skills/task-planner/SKILL.md` and incorporate its principles into the CLAUDE.md or a `.claude/rules/workflow.md` file. Adapt the content to fit the project.

### 3. Ensure verification section exists
Check for a `## Verification` section with commands Claude can run after making changes. If missing:
- Look in package.json for test/lint/typecheck/build scripts
- Look for Makefile, justfile, or other task runners
- Add a `## Verification` section with discovered commands

### 4. Find contradictions
Identify any instructions that conflict with each other. For each contradiction, ask which version to keep.

### 5. Check for global skill extraction candidates
Look for content that could become a reusable global skill in `~/.claude/skills/`:
- Is about a tool/framework (not project-specific)
- Same instructions appear in 2+ projects
- Is substantial (>20 lines)

### 6. Identify essentials for root CLAUDE.md
Extract only what belongs in the root CLAUDE.md:
- One-line project description
- Package manager (if not npm)
- Non-obvious commands only
- Links to `.claude/rules/` files with brief descriptions
- Verification section (always required)

### 7. Group remaining content
Organize remaining instructions into `.claude/rules/` files by category.

### 8. Flag for deletion
Identify content that should be removed entirely:
- API documentation (link to external docs instead)
- Code examples (Claude can infer from reading source files)
- Interface/type definitions (these exist in the code)
- Generic advice ("write clean code", "follow best practices")
- Obvious instructions
- Redundant info
