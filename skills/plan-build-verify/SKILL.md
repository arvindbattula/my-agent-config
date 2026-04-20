---
name: plan-build-verify
description: "Workflow orchestration for complex coding tasks. Use for ANY non-trivial task (3+ steps or architectural decisions) to enforce planning, subagent strategy, self-improvement, verification, elegance, and autonomous bug fixing. Triggers: multi-step implementation, bug fixes, refactoring, architectural changes, or any task requiring structured execution."
---

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: append the pattern to `docs/learnings.md` (create if missing)
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review `docs/learnings.md` at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

Persistence rule: durable project knowledge lives **only** in `docs/`. Never create sibling workspace directories (`tasks/`, `notes/`, `workspace/`, etc.). Canonical mapping: plans → `docs/state.md`, patterns → `docs/learnings.md`, decisions → `docs/decisions.md`. (Scaffolded projects may also use `docs/spec.md` and `docs/plan.md`.)

1. **Plan First**: Draft the plan in the active chat (plan mode / TaskCreate). For scaffolded projects, the phased build plan belongs in `docs/plan.md`; otherwise persist active plans to `docs/state.md`.
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go (in-chat tasks or `docs/plan.md` phase status)
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Commit the outcome to `docs/state.md` at end-of-session (see `/wrap-session`)
6. **Capture Lessons**: Append corrections and surprises to `docs/learnings.md`; architectural choices go to `docs/decisions.md`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is simple enough to skip planning" | Tasks that feel simple are where hidden complexity lives. 10 min of planning prevents 2 hours of rework. |
| "I'll plan as I go" | That's how you end up with a tangled mess. Written plans survive session boundaries and context compaction. |
| "The plan is in my head" | Context windows are finite. Written plans survive compaction and session restarts. |
| "I can hold all this context" | You can't. That's why we persist to `docs/` files. |
| "This fix is obvious, just do it" | Obvious fixes have non-obvious side effects. Verify before marking done. |
| "Elegance doesn't matter for a quick fix" | Quick fixes become permanent. A hacky fix you ship is tech debt you own. |

## Red Flags

- Starting implementation without a written plan (chat plan mode or `docs/plan.md`)
- Creating a sibling workspace directory (`tasks/`, `notes/`, `workspace/`, etc.) instead of using `docs/`
- Multiple unrelated changes accumulating without commits
- "Let me just quickly add this too" scope expansion
- Skipping verification to move faster
- More than 100 lines written without running tests
- Marking a task complete without proving it works
- Same fix attempted 3+ times without stopping to re-plan

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
