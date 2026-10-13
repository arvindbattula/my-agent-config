---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet.

## Rounds use the ask_user_question tool

Render each round as **one `ask_user_question` call**, not markdown Q&A:

- Ask the whole frontier in one round, up to the tool's **4 questions per call**. If the frontier is wider, rank it: the questions whose answers unblock the most downstream decisions go first, the rest wait for the next round.
- Each question gets 2–4 options. **Your recommended answer is the first option**, its label suffixed with `(Recommended)`. Trade-offs live in each option's `description`, not in the question text.
- Keep the `question` field to one crisp sentence. When a decision needs richer context — a UI layout, a code sketch, a config shape — put it in the option's `preview` (renders as markdown, side-by-side) rather than in prose around the call.
- If a round needs framing that won't fit in option descriptions, write a short plain-text preamble in the same message, then make the tool call.
- The user can always type a custom answer or Esc out. A custom answer is a decision too — treat it as settled and record it.

## Record every settled decision in writing

Tool answers are clicks; clicks evaporate. After each round, write down what settled:

- Under `/grill-with-docs`: domain terms and hard-to-reverse calls go to `GLOSSARY.md` / ADRs as they land, in every tier.
- **T1 (single-ticket feature work):** append the settled decisions to the ticket file on the issue tracker (`.scratch/<slug>/ticket.md` on a local tracker). The ticket is what `/implement` and `/code-review`'s Spec axis will read later — if it isn't written there, the interview didn't happen as far as the build is concerned.
- **T2 (structural, headed to `/to-spec`):** record settled decisions to `.scratch/<topic>/decisions.md` as they land. `/to-spec` synthesizes the spec from the conversation, but a compaction or handoff between grilling and to-spec makes that file the reliable carrier — to-spec should read it before writing the spec. Don't write per-ticket files yet; the tickets don't exist until `/to-tickets`.

## Escape hatch

If the user wants open discussion instead of structured choices ("discuss with me", "don't draft yet", brainstorming out loud), drop the tool and talk. Return to `ask_user_question` when a concrete decision point crystallizes. Never produce a deliverable (draft, document, code) while the user is still mid-discussion — mirror the problem statement back and wait for the explicit ask.

## Facts are your job, decisions are theirs

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

---

_Local deviation (pi fork, 2026-10): rounds render via `ask_user_question` instead of upstream Matt's markdown `❓/➡️` rounds — user preference (qcg-dsu-studio). If syncing skills from upstream, keep this rendering section._

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
- 2026-10-05 [qcg-dsu-studio]: Twice the agent produced deliverables while the user was still mid-discussion ("discuss with me — don't draft the reply yet"; a regenerated HTML with "the problem statement itself wrong"). Before any artifact in a design session, mirror the problem statement back and wait for an explicit ask. (evidence: dap-techroom + techroom-architecture sessions 2026-10-05)
- 2026-10-08 [qcg-dsu-studio]: When the design touches a state machine or cascade, add a "state residence" probe: for each level/behavior the module must drive, ask where its state lives (store field, component useState, DOM). 3 of 4 mid-build amendments came from skipping this (evidence: .scratch/interaction-state/ticket.md amendments 12-15).
- 2026-10-08 [qcg-dsu-studio]: Repo-policy side effects during grilling (un-ignoring .scratch/) must be framed as questions, not made inline; both code-review axes flagged it P1 and the user reversed it (evidence: code-review round 1, PR 23916).
