# Team Workflow SOP — Claude Code

This repo is a shared Claude Code configuration — skills, commands, and rules — that every team member installs once on their machine. It standardizes how Claude behaves across the team, what commands are available, and how projects are structured from discovery through delivery.

Standard operating procedure for teams using this repo to collaborate on projects with Claude Code.

---

## Prerequisites

Every team member installs this config once on their machine:

```bash
git clone https://github.com/arvindbattula/my-agent-config.git
cd my-agent-config
./install.sh --force
```

This installs all skills, commands, rules, and settings into `~/.claude/` — active across every project on that machine. To keep config in sync across machines, run `/sync` periodically.

---

## The Workflow at a Glance

```
/scaffold → /discover → /blueprint → /construct → /inspect → (repeat) → /retro
```

All `docs/` changes — spec, plan, decisions, learnings — go through PRs. Never commit directly to main.

---

## Stage 1: Project Kickoff

### `/scaffold`
**Who:** Tech lead
**When:** Once, at project start

Run `/scaffold` in the project repo. Creates `docs/` with `spec.md`, `plan.md`, `decisions.md`, `learnings.md`, and a starter `CLAUDE.md`. Commit and merge to main before anything else.

---

### `/discover`
**Who:** PM + tech lead, with the team if available
**When:** After `/scaffold` is merged
**Output:** `docs/spec.md`

Run as a **synchronous session** — one person drives Claude on a shared screen while the team discusses. Claude leads a layered interview; don't skip ahead or answer for the team.

**Useful additions during discovery:**
- **`/grill-me`** — after the initial discovery session, run this to stress-test the spec. Claude interviews you relentlessly on every unresolved decision branch before the spec is written. Good for catching gaps before they become mid-build surprises.
- **`deep-research` skill** — auto-triggers when evaluating technical options during Layer 5 (Technical Shape). If you say "research framework options" or "investigate this API", Claude will run multi-source research and synthesize findings before recommending.
- **`visualise` skill** — auto-triggers when Claude determines a diagram would clarify something. Useful for mapping user flows, system architecture, or data models during the interview.

After the session, Claude writes `docs/spec.md`. Tech lead raises a PR — PM and tech lead have final say on approval.

> Claude reads `~/.claude/memory/engineering_patterns.md` (per-developer) and `~/.claude/memory/discovery-blind-spots.md` automatically at the start of `/discover`. Patterns and blind spots accumulated from prior projects will inform the interview without any manual input.

---

## Stage 2: Planning

### `/blueprint`
**Who:** Tech lead
**When:** After spec is merged
**Output:** `docs/plan.md`

Tech lead runs `/blueprint`. Claude reads `docs/spec.md` and proposes a phased build plan. Each phase must be completable by one developer in one session — push back if a phase feels too large and ask Claude to split it.

**Useful addition:**
- **`/push-further`** — after Claude proposes the plan, run this to challenge it. Claude reviews everything produced so far and proposes the single boldest, most valuable addition. Use it when the plan feels safe but not exceptional.

Tech lead raises a PR with `docs/plan.md`. Team reviews phase ordering, sizing, and dependencies. Merge when approved — this is the build contract.

---

## Stage 3: Construction

### `/construct`
**Who:** Any developer
**When:** One phase per session, per developer
**Output:** Code + updated `docs/plan.md`, `docs/learnings.md`

**One developer owns one phase.** If two developers need to work in parallel, assign separate phases — not the same phase on parallel branches. If a phase is genuinely too large for one person, the tech lead should update `docs/plan.md` to split it first.

For each phase:

1. Create a feature branch
2. Run `/construct [phase number]`
3. Claude orients itself from `docs/spec.md`, `docs/plan.md`, `docs/learnings.md` — no need to re-explain the project
4. If Claude hits a spec gap mid-build, it will stop, ask targeted questions, amend `docs/spec.md`, and continue — don't work around gaps
5. Run `/decide` for any significant technical choice made during the phase (library selection, data model decision, architectural tradeoff) — these get logged to `docs/decisions.md` so the team understands the why
6. Before raising the PR, clean up (see below)

**Skills that auto-trigger during `/construct`:**
- **`test-first`** — triggers when building features or fixing bugs. Enforces red-green-refactor with vertical slicing (one test → one implementation → repeat). Don't write all tests first then all code.
- **`plan-build-verify`** — triggers for complex multi-step tasks within a phase (3+ steps, architectural decisions). Adds structured planning and verification within the phase.
- **`triage-issue`** — triggers when investigating a bug or reported issue. Explores the codebase to find root cause, then creates a GitHub issue with a TDD fix plan. Use this instead of diving into debugging blind.

> **Context window:** Check the status bar. If context usage is above 40%, finish the current task and start a fresh session for the next one. All project context is persisted in `docs/` — nothing is lost between sessions.

---

## Stage 4: Pre-PR Cleanup

Run these before raising any PR, in order:

1. **`/cleanup-ai-slop`** — diffs against main and removes AI-generated cruft: unnecessary comments, defensive checks on trusted paths, `any` casts, style inconsistencies. Reports what it changed in 1-3 sentences.
2. **`/code-simplify`** — reviews recently changed code for clarity, consistency, and unnecessary complexity. Fixes issues found without changing behavior.

These keep the codebase clean and consistent regardless of who generated the code.

---

## Stage 5: Review

### `/inspect`
**Who:** Developer (before PR) + tech lead (during PR review)

**Developer pass — before raising PR:**
1. Run `/inspect` on the completed phase
2. Fix all `Fix Now` items before raising the PR
3. Note `Fix Later` items as PR comments for the team to triage

**Tech lead pass — during PR review:**
1. Run `/inspect` independently
2. Check spec compliance — is what was built what was specified?
3. Raise findings as PR comments; approve when `Fix Now` items are resolved

**Additional review tool:**
- **`/review-architecture`** — not needed on every PR, but run this periodically (e.g., at the end of a major feature) to find architectural improvements. Claude explores the codebase for shallow modules, testability issues, and coupling problems, then proposes deepening opportunities with multiple interface designs.

---

## Stage 6: Retrospective

### `/retro`
**Who:** Tech lead (or whoever calls it)
**When:** At milestone PRs or whenever the team decides
**Output:** Updated `docs/learnings.md` in the project repo

1. Run `/retro` after merging a milestone
2. Claude audits spec vs. reality — what was missed, what changed, what was forced mid-build
3. Claude updates `docs/learnings.md` with distilled patterns — raise a PR
4. Claude also updates the developer's personal `~/.claude/memory/` files — these are per-developer and not committed to the repo

Don't wait until the project ships. Run `/retro` when the team surfaces repeated friction, after a hard phase completes, or at natural milestones.

---

## Mid-Flight Onboarding

When a developer joins a project already in progress:

1. Install this config repo if not already done (`./install.sh --force`)
2. Clone the project repo and open it in Claude Code
3. Read in order: `CLAUDE.md` → `docs/spec.md` → `docs/plan.md` → `docs/decisions.md` → `docs/learnings.md`
4. Ask Claude to walk you through the codebase in the context of the spec

No formal handoff session required — `docs/` is the source of truth. If it's insufficient for onboarding, that's a signal the tech lead should update `CLAUDE.md`.

> **Tech lead responsibility:** Keep `CLAUDE.md` current. Run `/organize-claude-config` periodically to refactor it for progressive disclosure and remove content that's become stale or redundant.

---

## One-Off and Exploratory Work

For quick investigations, spikes, or ad-hoc sessions outside the main workflow:

1. Work on a scratch branch — never commit directly to main
2. Claude helps freely — no workflow overhead
3. If something useful emerges (a decision, a learning), manually add it to `docs/learnings.md` or run `/decide` and raise a PR

**Rule of thumb:** If the output affects how others build, it belongs in `docs/`. If it's just for your own understanding, it doesn't.

---

## Extending the System

As the team encounters recurring tasks not covered by existing commands and skills:

- **`find-skills`** — auto-triggers when you ask "is there a skill for X" or "how do I do X". Claude searches the skills ecosystem and helps install what's relevant.
- **`skill-creator`** — auto-triggers when you want to build a new skill. Use this when a pattern or workflow recurs across projects and you want to encode it as a reusable skill.
- **`prompt-master`** — auto-triggers when writing or improving prompts for agentic tasks. Use this when crafting complex Claude Code instructions or automation prompts.

Skills live in `~/.claude/skills/` and auto-trigger based on context — no invocation needed once installed.

---

## Ongoing Work

### Bug Reports

1. Developer runs `triage-issue` skill (auto-triggers when you describe a bug) — Claude investigates the codebase, finds the root cause, and creates a GitHub issue with a TDD fix plan
2. Tech lead assigns the issue to a developer as a phase
3. Developer follows the standard construction flow: feature branch → `/construct` → pre-PR cleanup → `/inspect` → PR
4. **Trivial single-line fixes** may skip `/construct` at the tech lead's discretion — but `/inspect` is always required

---

### New Feature Requests

Tech lead decides which path based on scope:

**Small** — fits in 1 phase, no new external dependencies, no data model changes:
1. Tech lead runs `/blueprint` to add the new phase to `docs/plan.md` → PR
2. Developer picks it up via standard `/construct` flow

**Medium or Large** — touches multiple phases, introduces new dependencies, changes the data model, or the tech lead isn't sure:
1. PM + tech lead run a focused `/discover` session scoped to the new feature → amends `docs/spec.md` → PR
2. Tech lead runs `/blueprint` to add phases → PR
3. Developers pick up phases via standard `/construct` flow

When in doubt, run mini-discover. Catching a gap in a 30-minute spec session is faster than a mid-build reconciliation.

---

### Requirement Changes

Any change to `docs/spec.md` after the initial merge:

1. PM or tech lead raises the change in a PR with a clear description of what changed and why
2. PM + tech lead must both approve — same authority as the original spec
3. Tech lead assesses impact on `docs/plan.md` — do any phases need to be added, removed, or re-scoped?
4. If phases change, update `docs/plan.md` in the same PR
5. Log the change with `/decide` if it involved a significant tradeoff

Developers mid-phase who are affected by the change: stop, pull the updated spec, and run the `/construct` reconciliation protocol before continuing.

---

### Tech Debt and Refactoring

Ad-hoc — no fixed schedule. Natural triggers:
- `/retro` surfaces repeated friction or recurring issues
- `/review-architecture` flags shallow modules or coupling problems
- A developer notices meaningful drift from `docs/spec.md` during day-to-day work

When the team decides to address it:
1. Tech lead adds a cleanup phase to `docs/plan.md` → PR
2. Developer runs `/construct` for that phase — use `/remove-dead-code` for unused files and dependencies, `/review-architecture` for structural improvements
3. Standard pre-PR cleanup and `/inspect` apply

---

## Keeping `docs/` Healthy

| File | Who writes it | Trigger |
|---|---|---|
| `docs/spec.md` | `/discover`, `/construct` (gaps) | PR |
| `docs/plan.md` | `/blueprint`, `/construct` | PR |
| `docs/decisions.md` | `/decide` | PR |
| `docs/learnings.md` | `/construct`, `/inspect`, `/retro` | PR |
| `CLAUDE.md` | Tech lead | PR |

---

## Personal Developer Memory

Each developer accumulates personal cross-project memory in `~/.claude/memory/`:

- `engineering_patterns.md` — validated tech choices and architectural patterns across all your projects
- `discovery-blind-spots.md` — categories of things you tend to miss during discovery

These are per-developer, not committed to any project repo. `/retro` updates them automatically. To carry them to a new machine, copy `~/.claude/memory/` manually.

---

## Quick Reference

| Situation | What to run |
|---|---|
| **Project kickoff** | `/scaffold` → `/discover` → PR → `/blueprint` → PR |
| Stress-test the spec | `/grill-me` |
| Challenge the plan | `/push-further` |
| **Build a phase** | `/construct [N]` on a feature branch |
| Log a decision | `/decide` |
| Before raising a PR | `/cleanup-ai-slop` → `/code-simplify` → `/inspect` |
| **Milestone reached** | `/retro` → PR |
| **Bug reported** | `triage-issue` skill → `/construct` → `/inspect` → PR |
| **Small feature request** | `/blueprint` (add phase) → PR → `/construct` |
| **Large feature request** | mini `/discover` → PR → `/blueprint` → PR → `/construct` |
| **Requirement change** | amend `docs/spec.md` → PR (PM + tech lead) → update `docs/plan.md` |
| **Tech debt** | `/review-architecture` or `/remove-dead-code` → add phase → `/construct` |
| New developer joins | Read `docs/` + `CLAUDE.md`, ask Claude to orient you |
| Architecture review | `/review-architecture` |
| CLAUDE.md getting long | `/organize-claude-config` |
| Config out of sync | `/sync` |
| Need a skill for X | Ask Claude — `find-skills` auto-triggers |
| Context >40% | Finish current task, start fresh session |
