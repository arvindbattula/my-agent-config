Break the project specification into a phased, ordered build plan. Each phase is small enough to complete and verify in one Claude Code session.

## Prerequisites

Read these files before starting:
- `docs/spec.md` — the specification (required — if missing, tell user to run `/discover` first)
- `CLAUDE.md` — project context
- `docs/learnings.md` — any prior learnings

If `docs/spec.md` is empty or only has the placeholder comment, stop and tell the user to run `/discover` first.

## Process

### Step 1: Analyze the spec

Read the spec and identify:
- The core functionality (what MUST work for this to be useful)
- The natural build order (what depends on what)
- Where the thin vertical slice is (the simplest end-to-end path)

### Step 2: Propose phases

Present a phased breakdown to the user. Follow these principles:

- **Phase 1 is always the thinnest vertical slice.** End-to-end, but minimal. The user should be able to run it and see something work.
- **Each phase produces something runnable or testable.** No "setup only" phases — every phase should have a visible outcome.
- **Phases are ordered by dependency, then value.** Build what's needed first, then what's most valuable.
- **Each phase is completable in one session.** If a phase feels too big, split it.
- **The last phase is always "polish & harden."** Edge cases, error handling, performance, cleanup.

For each phase, specify:

```markdown
## Phase N: [Short Name]
**Build:** (what gets created or changed — be specific about files/components)
**Verify:** (how to confirm it works — specific steps the user can take)
**Test:** (what tests to write, if applicable)
**Done when:** (explicit, observable completion criteria)
```

### Step 3: Map dependencies

After the phases, add a dependencies section:
- Which phases depend on which
- Which phases could theoretically be done in parallel (useful for Codex later)

### Step 4: User review

Present the full plan. Ask the user:
- "Does this order make sense?"
- "Is any phase too big or too small?"
- "Anything missing?"

Adjust based on feedback.

### Step 5: Write the plan

Write the approved plan to `docs/plan.md` using this format:

```markdown
# [Project Name] — Build Plan

Generated from: docs/spec.md
Date: [today's date]

## Phase 1: [Name] — Vertical Slice
**Build:** ...
**Verify:** ...
**Test:** ...
**Done when:** ...
**Status:** [ ] Not started

## Phase 2: [Name]
**Build:** ...
**Verify:** ...
**Test:** ...
**Done when:** ...
**Status:** [ ] Not started

...

## Phase N: Polish & Harden
**Build:** ...
**Verify:** ...
**Test:** ...
**Done when:** ...
**Status:** [ ] Not started

## Dependencies
- Phase 2 depends on Phase 1
- Phase 3 and 4 can run in parallel after Phase 2
- ...
```

### Step 6: Suggest next step

Tell the user: "Run `/construct` to start building Phase 1."

## Planning Principles

- **Vertical over horizontal.** Don't plan "set up the database" then "build the API" then "build the UI." Plan "user can do X end-to-end" then "user can also do Y."
- **Name the risks.** If a phase has technical uncertainty, flag it: "This phase depends on [API/library] working as expected. If it doesn't, we may need to revisit."
- **Respect the spec boundaries.** Don't plan features that are listed as out-of-scope in the spec.
- **Keep it concrete.** "Build the dashboard" is too vague. "Create index.html with a table showing tab data grouped by topic" is specific enough to build from.
