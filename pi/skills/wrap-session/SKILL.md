---
name: "wrap-session"
description: "End-of-session routine. Scans the conversation, routes learnings to the right persistence destination (memory, docs/state.md, project context file), and leaves a breadcrumb for the next session."
disable-model-invocation: true
---

<!--
TODO / judgment call made during Claude→Pi port (2026-09-24):

Claude Code's version wrote to an auto-memory dir at
`~/.claude/projects/<slug>/memory/`, created and read automatically by the
harness, plus a `~/.claude/bin/recall` CLI. Pi has `@mnemosyne-oss/pi-mnemosyne`
enabled (settings.json `packages`) which is presumably the memory layer, but
this port did not find a confirmed on-disk memory directory or CLI to target
(only `~/.pi/agent/sessions/<slug>/*.jsonl` transcripts exist, which are raw
session logs, not curated memory). Until mnemosyne's actual storage location
and interface are verified, treat the "Auto-memory" destination below as
provisional — ask the user where curated memory should live before writing,
rather than guessing a path.
-->

End-of-session hygiene. Routes this session's learnings to the right persistence destination so the next session starts smarter, not stale. Surgical — routes, doesn't dump.

**Distinct from Pi's `handoff` skill:** `handoff` compacts an in-progress conversation into a document for another agent to resume mid-task. `wrap-session` is about routing durable learnings (preferences, library quirks, decisions, in-flight state) to their correct long-term home once a session is winding down — a different purpose, usable independently of whether a handoff doc is also needed.

## When to Use

Run when winding down a session you expect to resume later. Skip if:
- You already ran `/skill:retro` this session (retro covers milestone-level reflection)
- Nothing notable surfaced — no preferences corrected, no quirks discovered, no in-flight work

## Prerequisites

- A memory location (see TODO above — confirm with the user until mnemosyne's path is verified)
- `docs/` directory if the project uses one (optional — `state.md` will be created if useful)

## Process

### Step 1: Pre-flight — what's already saved?

Read the current `CLAUDE.md`/`AGENTS.md`, `docs/state.md` (if it exists), `docs/decisions.md` (if it exists). You will not re-save content already captured there.

### Step 2: Scan the session for candidates

Review the conversation for facts that would save next-session-you time. Categorize each:

| Type | Examples |
|---|---|
| **User preference / correction** | "don't use X", "prefer Y", "always do Z when A" — validated in this session |
| **Library / API learning** | non-obvious behavior, version quirk, undocumented default |
| **User role / context** | stable facts about the user's work, goals, expertise |
| **In-flight work state** | what's done, what's next, what's blocked, why we stopped here |
| **Explicit decision** | architectural or product choice made during this session |
| **Repo-wide convention** | a pattern that will apply to ALL future work in this repo |

### Step 3: Route each candidate to the correct destination

| Candidate type | Destination | File pattern |
|---|---|---|
| User preference / feedback | Memory (see TODO) | `feedback_<topic>.md` |
| Library / API learning | Memory (see TODO) | `reference_<lib>.md` |
| User role / context | Memory (see TODO) | `user_<topic>.md` |
| Project-specific goals (long-lived) | Memory (see TODO) | `project_<topic>.md` |
| In-flight work state (short-lived) | `docs/state.md` | — |
| Explicit decision | Prompt user: "run `/skill:decide`" | — |
| Repo-wide convention | `CLAUDE.md`/`AGENTS.md` | — (RARE, high bar) |

For memory, update its index file with a one-line pointer per new entry, once that index's location is confirmed.

**`docs/state.md` shape (≤30 lines total, overwritten each session):**

```markdown
# Session State — <YYYY-MM-DD>

**Branch:** <current branch>

## Done
- item

## Next step
- concrete next action

## Open questions
- question (why it matters)

## Landmines
- thing already tried that didn't work
```

### Step 4: Apply exclusions (do NOT save)

- Derivable from code (architecture, file paths, conventions a reader can see)
- Derivable from git log (what changed, who, when)
- Session narrative ("in this session we built X") — belongs in commit messages
- Already in `CLAUDE.md`/`AGENTS.md`, memory, or `docs/`
- Ephemeral task state (tasks for current conversation only)

### Step 5: Review-before-write

For each proposed edit, print:

```
FILE: <path>
TYPE: <memory|state|project-context>
REASON: <one-line justification>
+ <content to add>
```

Ask: "Apply all / pick which / cancel?" Do NOT write anything without explicit approval.

### Step 6: Hard limits

- **≤5 new lines per file per invocation.** More than that, reconsider — probably session noise.
- **`docs/state.md` is OVERWRITTEN, not appended.** It's current state, not a log.
- **`CLAUDE.md`/`AGENTS.md` additions need a high bar.** They load into every future session forever. If it's not a rule that applies to ALL future work, put it in memory instead.

### Step 7: Report

After writing, summarize:
- Files changed with line counts
- Anything skipped that the user might want to add manually
- If any decisions surfaced: "Decisions detected — consider running `/skill:decide` for: X, Y"

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is useful, let me save it" | Useful ≠ stable-across-sessions. Filter on "will this still be true next session?" |
| "Put it in the project context file so it's always loaded" | It costs tokens in every future session. Use memory for 95% of cases. |
| "I'll summarize what we did this session" | Don't. git log already has that. `state.md` is forward-looking, not a journal. |
| "Let me include rich context in state.md" | No. 30 lines max. Context lives in code and memory. state.md is a breadcrumb. |
| "Nothing was explicitly corrected — nothing to save" | Watch for *validated* choices too — the user confirming a non-obvious approach is saveable feedback. |

## Red Flags

- Writing >5 lines to `CLAUDE.md`/`AGENTS.md` in one wrap
- Same content copied into multiple files
- `docs/state.md` describes completed work (that's a journal, not state)
- Memory entry for ephemeral task details
- Writing without the review-before-write step
- Forgetting to update the memory index after creating a new entry

## Performance Notes
<!-- Updated by /skill:retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
