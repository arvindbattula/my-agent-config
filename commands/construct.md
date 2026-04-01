---
name: construct
description: Execute one phase from the build plan
---

Execute one phase from the build plan. Builds incrementally, verifies before marking done, and records learnings.

## Arguments

Optional: phase number (e.g., `/construct 2`). If omitted, picks the next incomplete phase.

## Prerequisites

Read these files before starting:
- `docs/spec.md` — the specification (required)
- `docs/plan.md` — the build plan (required — if missing, tell user to run `/blueprint` first)
- `docs/learnings.md` — prior learnings (read if exists)
- `docs/decisions.md` — prior decisions (read if exists)
- `CLAUDE.md` — project context

If `docs/plan.md` is empty or only has the placeholder comment, stop and tell the user to run `/blueprint` first.

## Context Window Management

**Check the statusline before starting.** The context percentage in the status bar tells you how much room is left for reasoning.

- **Under 40%:** Good — plenty of room. Proceed normally.
- **40-60%:** Caution zone. Complete the current phase but don't start another in this session. After finishing, suggest: "Context is getting heavy. Start a fresh session for the next phase — your spec, plan, and learnings will carry over."
- **Over 60%:** If you haven't started building yet, tell the user: "Context is too full to build well in this session. Start a fresh `/construct` session — all project context is in the docs/ files." If you're mid-build, finish the current task but skip non-essential work.

**Why this matters:** Claude's reasoning quality degrades as context fills up. The whole point of persisting everything to `docs/` files is that you can start fresh sessions without losing anything. A clean session with 5% context reading spec + plan will produce better code than a bloated session at 70%.

## Process

### Step 1: Identify the phase

- If user specified a phase number, use that
- Otherwise, scan `plan.md` for the first phase with `Status: [ ] Not started` or `Status: [~] In progress`
- Announce: "Starting Phase N: [Name]" and briefly restate what this phase builds

### Step 1b: Orientation

Before reading docs/, run quick checks to scope the current state:

```bash
# What files exist for this phase? (avoids re-reading plan for file list)
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.py" -newer docs/plan.md 2>/dev/null | head -20

# Any test files already written?
find . -name "*.test.*" -o -name "*.spec.*" 2>/dev/null | head -10

# How much has changed since last session?
git diff --stat HEAD~1 2>/dev/null || echo "No git history"
```

Use these results to calibrate Step 2 — skip full file reads if orientation shows nothing has changed.

### Step 2: Assess current state

Before building, check if this phase has prior work from a previous session:

1. Check which output files mentioned in the **Build** section already exist
2. If tests exist for this phase, run them to see what passes and what fails
3. If a **Verify** step exists, run it

Report to the user:
- If prior work found: "Phase N is partially done — [files] exist, [N/M] tests pass. Resuming from [specific gap]."
- If no prior work: "Phase N has no prior work. Starting fresh."

This prevents re-doing work lost to session timeouts or context limits.

### Step 3: Review the phase requirements

Re-read the phase's **Build**, **Verify**, **Test**, and **Done when** sections. If anything is ambiguous or conflicts with the spec, ASK the user before proceeding. Do not guess.

### Step 4: Build

Implement the phase. Follow these principles:

- **Tests alongside code.** If the phase has a Test section, write tests as you go (not all at the end). Use the test-first skill approach when applicable.
- **Small commits.** If git is set up, commit at natural checkpoints within the phase.
- **Spec is the source of truth.** If you're tempted to build something not in the spec, stop and ask.
- **Reconcile spec gaps — don't work around them.** If you discover the spec is missing something, contradicts itself, or forces a decision not covered, trigger the reconciliation protocol:
  1. **Stop building.** Name the issue: "Spec says [X] in [section], but implementing it requires [Y] which [contradicts/isn't covered by] [section]."
  2. **Ask scoped questions.** 2-3 targeted questions to resolve just this gap — not a full re-discovery.
  3. **Draft a spec amendment.** Write the proposed change to `docs/spec.md`.
  4. **Quick cross-check.** Re-read related requirements to verify the amendment doesn't break anything else.
  5. **User approves** → update `docs/spec.md` → log the amendment in `docs/decisions.md` with context → continue building.
- **Flag decisions.** If you make a non-trivial technical choice (library selection, data structure, API design), note it for the user to potentially record with `/decide`.

### Step 5: Verify

Run the verification steps listed in the phase:
- Execute any tests
- Run the app/script and confirm the expected behavior
- Check against the "Done when" criteria

If verification fails, fix the issue. If you can't fix it, explain what's wrong and ask for guidance.

### Step 6: Record learnings

Append to `docs/learnings.md` anything surprising or useful discovered during this phase:
- Unexpected behavior from a library or API
- A pattern that worked well (or didn't)
- A constraint discovered during implementation
- Anything a future session should know

Format:
```markdown
## Phase N: [Name] — [Date]
- [Learning 1]
- [Learning 2]
```

Don't record obvious things. Only record what would save time or prevent mistakes in a future session.

### Step 7: Update plan status

In `docs/plan.md`, update the phase status:
```markdown
**Status:** [x] Complete — [Date]
```

### Step 8: Update CLAUDE.md

If this phase added build/run/test commands, update the relevant section of `CLAUDE.md`.

### Step 9: Report and suggest next step

Tell the user:
- What was built
- Verification results
- Any learnings recorded
- Any decisions that should be logged with `/decide`
- "Run `/construct` to start Phase N+1" or "All phases complete — consider running `/inspect` for a full review."

## Key Rules

- **One phase per invocation.** Don't build multiple phases unless explicitly asked.
- **Ask, don't guess.** If the spec doesn't cover something you need to decide, ask.
- **Verify before done.** Never mark a phase complete without running verification.
- **Keep context alive.** Everything important goes into learnings.md, decisions.md, or CLAUDE.md — not just conversation context.
- **Spec reconciliation is not optional.** Don't work around a spec gap with a guess — the spec is the source of truth, and if it's wrong, fix it first. But keep reconciliation lightweight: resolve the specific issue, don't re-open the full discovery.

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
- 2026-03-31 [innovate-intel]: Context window management advice was critical — Phase 8e/8f was deferred to a fresh session after 8a-8d filled context. Fresh session produced clean code on first pass (evidence: session handoff message)
- 2026-03-31 [innovate-intel]: Batching independent frontend fixes into parallel edits worked well (8e-a through 8e-d). Backend fixes needed sequential handling due to shared server.py (evidence: docs/learnings.md Phase 8e/8f)
- 2026-03-31 [innovate-intel]: Vitest fake timers + React = fragile. Two tests broke due to jsdom incompatibility. Deferred-promise pattern (control when the mock resolves) is more reliable than vi.useFakeTimers() for async polling tests (evidence: docs/learnings.md)
