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

## Process

### Step 1: Identify the phase

- If user specified a phase number, use that
- Otherwise, scan `plan.md` for the first phase with `Status: [ ] Not started` or `Status: [~] In progress`
- Announce: "Starting Phase N: [Name]" and briefly restate what this phase builds

### Step 2: Review the phase requirements

Re-read the phase's **Build**, **Verify**, **Test**, and **Done when** sections. If anything is ambiguous or conflicts with the spec, ASK the user before proceeding. Do not guess.

### Step 3: Build

Implement the phase. Follow these principles:

- **Tests alongside code.** If the phase has a Test section, write tests as you go (not all at the end). Use the test-first skill approach when applicable.
- **Small commits.** If git is set up, commit at natural checkpoints within the phase.
- **Spec is the source of truth.** If you're tempted to build something not in the spec, stop and ask.
- **Flag spec gaps.** If you discover the spec is missing something needed for this phase, tell the user. Suggest a spec update. Don't silently fill in gaps.
- **Flag decisions.** If you make a non-trivial technical choice (library selection, data structure, API design), note it for the user to potentially record with `/decide`.

### Step 4: Verify

Run the verification steps listed in the phase:
- Execute any tests
- Run the app/script and confirm the expected behavior
- Check against the "Done when" criteria

If verification fails, fix the issue. If you can't fix it, explain what's wrong and ask for guidance.

### Step 5: Record learnings

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

### Step 6: Update plan status

In `docs/plan.md`, update the phase status:
```markdown
**Status:** [x] Complete — [Date]
```

### Step 7: Update CLAUDE.md

If this phase added build/run/test commands, update the relevant section of `CLAUDE.md`.

### Step 8: Report and suggest next step

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
