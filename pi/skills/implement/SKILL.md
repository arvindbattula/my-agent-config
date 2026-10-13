---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the work came from an interview or discussion rather than a written spec, **persist the settled decisions to the issue tracker first** (`.scratch/<slug>/ticket.md` on a local tracker, slug matching the branch name) before writing code. `/code-review`'s Spec axis reads that file — an unpersisted interview means the review has nothing to check the diff against.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
- 2026-10-05 [qcg-dsu-studio]: A 5.5h UI ticket session reached 598 assistant messages and 2 compactions; quality degraded late-session (same bugs re-fixed). Cap feature sessions at a natural seam — commit and hand off rather than riding one context. (evidence: session 01a10c4a, wt-feat-tabular-popout-review-panel)
- 2026-10-05 [qcg-dsu-studio]: Broken code reached the user's browser twice (missing-export SyntaxError, API 500). Before every "check it in the browser" handoff, run the narrow gates — tsc + the touched test dir — as a hard stop, not just at ticket end. (evidence: same session, user-pasted console errors)
