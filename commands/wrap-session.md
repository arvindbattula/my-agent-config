---
name: wrap-session
description: End-of-session routine. Scans the conversation, routes learnings to the right persistence destination (auto-memory, docs/state.md, CLAUDE.md), and leaves a breadcrumb for the next session.
---

End-of-session hygiene. Routes this session's learnings to the right persistence destination so the next session starts smarter, not stale. Surgical — routes, doesn't dump.

## When to Use

Run when winding down a session you expect to resume later. Skip if:
- You already ran `/retro` this session (retro covers milestone-level reflection)
- Nothing notable surfaced — no preferences corrected, no quirks discovered, no in-flight work

## Prerequisites

- Auto-memory dir at `~/.claude/projects/<slug>/memory/` (Claude Code creates this automatically)
- `docs/` directory if the project uses one (optional — `state.md` will be created if useful)

## Process

### Step 1: Pre-flight — what's already saved?

List files in the auto-memory dir that were touched today:

```bash
find ~/.claude/projects/<slug>/memory -type f -newermt "$(date +%Y-%m-%d)" 2>/dev/null
```

Check whether the session's topics are already covered by existing memory:

```bash
~/.claude/bin/recall "<two or three topics from this session>" --scope current --budget 800
```

Read the current `CLAUDE.md`, `docs/state.md` (if it exists), `docs/decisions.md` (if it exists). You will not re-save content already captured or surfaced by recall.

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
| User preference / feedback | Auto-memory | `feedback_<topic>.md` |
| Library / API learning | Auto-memory | `reference_<lib>.md` |
| User role / context | Auto-memory | `user_<topic>.md` |
| Project-specific goals (long-lived) | Auto-memory | `project_<topic>.md` |
| In-flight work state (short-lived) | `docs/state.md` | — |
| Explicit decision | Prompt user: "run `/decide`" | — |
| Repo-wide convention | `CLAUDE.md` | — (RARE, high bar) |

For auto-memory, update `MEMORY.md` index with a one-line pointer per new file.

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
- Already in `CLAUDE.md`, memory, or `docs/`
- Ephemeral task state (tasks for current conversation only)

### Step 5: Review-before-write

For each proposed edit, print:

```
FILE: <path>
TYPE: <memory|state|CLAUDE>
REASON: <one-line justification>
+ <content to add>
```

Ask: "Apply all / pick which / cancel?" Do NOT write anything without explicit approval.

### Step 6: Hard limits

- **≤5 new lines per file per invocation.** More than that, reconsider — probably session noise.
- **`docs/state.md` is OVERWRITTEN, not appended.** It's current state, not a log.
- **CLAUDE.md additions need a high bar.** It loads into every future session forever. If it's not a rule that applies to ALL future work in this repo, put it in memory instead.

### Step 7: Report

After writing, summarize:
- Files changed with line counts
- Anything skipped that the user might want to add manually
- If any decisions surfaced: "Decisions detected — consider running `/decide` for: X, Y"

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is useful, let me save it" | Useful ≠ stable-across-sessions. Filter on "will this still be true next session?" |
| "Put it in CLAUDE.md so it's always loaded" | CLAUDE.md costs tokens in every future session. Use memory for 95% of cases. |
| "I'll summarize what we did this session" | Don't. git log already has that. `state.md` is forward-looking, not a journal. |
| "Let me include rich context in state.md" | No. 30 lines max. Context lives in code and memory. state.md is a breadcrumb. |
| "Nothing was explicitly corrected — nothing to save" | Watch for *validated* choices too — the user confirming a non-obvious approach is saveable feedback. |

## Red Flags

- Writing >5 lines to CLAUDE.md in one wrap
- Same content copied into multiple files
- `docs/state.md` describes completed work (that's a journal, not state)
- Memory entry for ephemeral task details
- Writing without the review-before-write step
- Forgetting to update `MEMORY.md` after creating a new auto-memory file

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
