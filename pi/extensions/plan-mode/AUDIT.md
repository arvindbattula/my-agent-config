# Plan-Mode Extension — Local Audit & Divergence Notes

**Source:** copied from `@earendil-works/pi-coding-agent/examples/extensions/plan-mode`
**Copied:** 2026-06-19 (pi v0.79.8)
**Owner:** arvindbattula — this is an owned snapshot, NOT auto-updated.

## Why this file exists
This snapshot intentionally diverges from the upstream example. If a future
`pi update` ships a newer example and you diff against it, **do not** blindly
revert these changes back to upstream — they are deliberate hardenings.

## Divergences from upstream (all in `utils.ts`)

### 1. Removed `curl` and `wget -O -` from SAFE_PATTERNS
Upstream allows outbound network commands in "read-only" plan mode.
For sensitive (PE / deal) data, network egress is an exfiltration vector and
breaks the meaning of "read-only". Plan mode here = **local** read-only only.

### 2. Added network egress to DESTRUCTIVE_PATTERNS
`curl wget nc ncat netcat ssh scp ftp` — blocked outright.

### 3. Added interpreter / command-substitution escapes to DESTRUCTIVE_PATTERNS
The upstream allowlist is prefix-anchored and trivially escaped via
`awk 'BEGIN{system("...")}'`, `find -exec`, `$(...)`, backticks, `bash -c`, etc.
Added blocks for: `system(`, `eval`, `exec`, `xargs`, `-exec`, `$(`, backtick,
`perl`, `ruby`, `bash -c`, `sh -c`.

## Feature addition (in `index.ts`)

### Plan-to-file persistence
When plan mode extracts a numbered plan, the **full plan text** (not the
50-char-truncated todo labels) is written to `PLAN-<UTC-timestamp>.md` in cwd.
Rationale: for investment/data-science analysis, a plan is an auditable
artifact, not just transient session state. Failure to write is non-fatal
(warns, continues). Added `import { writeFileSync } from "node:fs"` and a
`writePlanToFile()` helper; wired into the `agent_end` extract block.

Note: this writes to the current working directory. It does NOT honor any
ignore rules — if you don't want `PLAN-*.md` committed, add it to `.gitignore`.

### Block notifications with specific reasons
When a bash command is blocked in plan mode, the `tool_call` handler now:
- shows a TUI notification: `⏸ Plan mode blocked (<reason>): <command>` (warning), and
- returns a specific `reason` to the model so it can self-correct.

Reasons are categorized by a new `blockReason()` helper in `utils.ts`:
command-substitution / network / interpreter-exec / destructive / not-allowlisted.
This directly de-mystifies the `$(...)`/backtick rejection (see limitation below):
e.g. `cat $(ls -t)` now reports "command substitution not allowed" instead of a
generic block. `isSafeCommand()` is unchanged — `blockReason()` only explains it.

Notifications are deduped via a closure-scoped `lastBlockedCommand`: an identical
command blocked back-to-back notifies only once (the model often retries). It
resets on `/plan` toggle and whenever a command passes, so distinct attempts
still notify. The model-facing `reason` is NOT deduped — only the TUI toast.

## Known limitation (unchanged)
This is a **regex guardrail, not a sandbox.** A determined model can still
construct evasions (e.g. obfuscated string concatenation inside an allowed
interpreter). For a genuine read-only guarantee on sensitive repos, run pi in a
container — see `docs/containerization.md` / `examples/extensions/sandbox`.
Do not treat the allowlist as a security boundary.

## Footer integration gotcha (RESOLVED 2026-06-19)

**Symptom:** `/plan` enabled plan mode (notification fired, tools restricted)
but the `⏸ plan` footer indicator did NOT appear.

**Root cause:** plan-mode uses `ctx.ui.setStatus("plan-mode", ...)`, which writes
into the *built-in* footer's extension-status map
(`FooterDataProvider.getExtensionStatuses()`). But `statusline.ts` calls
`ctx.ui.setFooter(...)`, which **replaces the entire footer** with a custom
renderer. That custom renderer was not reading `getExtensionStatuses()`, so the
status was set but never drawn.

**Fix:** `~/.pi/agent/extensions/statusline.ts` was edited to read
`footerData.getExtensionStatuses()` and append any non-empty statuses to footer
line 1 (after the thinking segment). Verified against shipped source
`dist/core/footer-data-provider.d.ts` (method is real, returns
`ReadonlyMap<string, string>`).

**General rule:** ANY extension that calls `setFooter()` to replace the footer
must manually render `getExtensionStatuses()`, or every other extension's
`setStatus()` indicator (plan-mode, model-status, etc.) goes invisible. This is
a footer-ownership conflict, not a plan-mode bug. The plan-mode `setWidget()`
todo list (above the editor) is separate and unaffected.

## Maintenance
- Re-test `/plan` AND the footer `⏸ plan` indicator after each `pi update`
  (the footer-data-provider API or statusline.ts could drift)
- Re-test `/plan` (extension API can drift: events like
  `before_agent_start`, `setActiveTools`, `context`).
- If the upstream example gains real fixes, merge them in manually, keeping the
  divergences above.

### Post-PR review fixes (2026-06-20)
Applied after Copilot PR review on https://github.com/arvindbattula/my-agent-config/pull/29.
All fixed in both repo and `~/.pi/agent/extensions/`.

1. **`NORMAL_MODE_TOOLS` restored full baseline tools** (`index.ts`)
   Was `["read", "bash", "edit", "write"]` — exiting plan mode dropped
   `grep`, `find`, `ls`, `questionnaire`. Now includes all baseline tools so
   "Full access restored" is actually true.

2. **`writePlanToFile()` timestamp collision** (`index.ts`)
   Seconds-precision truncation (`slice(0, 19)`) caused overwrites if two
   plans were generated within the same second. Switched to full ISO
   millisecond precision and reused a single `Date` for filename + header.

3. **Removed misleading "brave-search via bash" from plan-mode prompt** (`index.ts`)
   The context prompt told the model to use web research via bash, but
   network egress (`curl`, `wget`, etc.) is blocked in plan mode. This caused
   repeated blocked-tool retries. Dropped the line entirely — local analysis
   only in plan mode.

4. **README typo: "question" → "questionnaire"** (`README.md`)
   Docs mismatched the actual tool name.

### Tool-preservation fix (2026-06-20)

5. **Hindsight tools lost on plan-mode exit** (`index.ts`)
   When toggling plan mode off, `pi.setActiveTools(NORMAL_MODE_TOOLS)` was
   called with a hardcoded list. Any tools not in that list — including the
   Hindsight tools that pi injects — were silently dropped.

   - Added `normalModeTools: string[] | null` to snapshot
     `pi.getActiveTools()` when plan mode is enabled, in both
     `togglePlanMode()` and `session_start`.
   - On exit (toggle off, execute plan, or plan complete), restore the
     exact snapshot: `pi.setActiveTools(normalModeTools ?? fallback)`.
   - Falls back to a static list only if the snapshot is null (defensive).
   
   This pattern generalizes to any future tools injected by core or other
   extensions — plan mode no longer needs to know every tool name.

### Progress widget lingered after execution (FIXED 2026-06-22)

**Symptom:** After choosing "Execute the plan (track progress)", the `setWidget`
todo checklist above the editor did not disappear when the model finished the
work. It only cleared one cycle later — after the next user message + model
response.

**Root cause:** Execution teardown (clear widget, exit `executionMode`, restore
tools) was gated entirely on `todoItems.every((t) => t.completed)` in
`agent_end`. Steps are only marked complete by the model emitting a `[DONE:n]`
tag (`markCompletedSteps` in `turn_end`). Models routinely finish the run
without tagging the final step(s), so `every()` stayed false and the widget was
never torn down. On the next turn, `before_agent_start` re-injects the
"Remaining steps … include a `[DONE:n]` tag" reminder; the model then emits the
missing tag(s), and the *following* `agent_end` finally cleared the widget —
hence the one-cycle lag.

**Evidence:** across recorded sessions, the structured `"executing":false`
teardown marker is present iff the session contains `[DONE:n]` tags. Sessions
with zero `[DONE:n]` tags never persisted `"executing":false` (widget never
cleared). The footer `⏸ plan`/`📋 N/M` indicator was NOT the culprit —
`statusline.ts` reads `getExtensionStatuses()` live in `render()`, and
`setWidget`/`setStatus` both call `requestRender()`.

**Fix (`index.ts`):** decoupled teardown from per-step tagging. Refactored the
all-complete block into a `finalizePlan(ctx, allDone)` helper, then in
`agent_end`: when the run goes idle with steps still untagged and a UI is
present, prompt `["Mark plan complete", "Keep tracking (still executing)"]`.
"Mark plan complete" clears the widget immediately; "Keep tracking"/Escape leaves
it (legitimate mid-plan pause). The fully-tagged path is unchanged (still
auto-finalizes — no regression), and headless/no-UI auto-finalizes rather than
hanging on a select.

**Tradeoff:** if the model pauses mid-plan to ask a clarifying question, the
finalize prompt appears alongside that question (one extra keypress: "Keep
tracking"). Accepted as rare vs. the guaranteed stale-widget bug. If this
friction shows up, switch to auto-finalize-on-idle (clear unless the final
message ends in a question) — lower friction, slightly heuristic.

## Deferred / push-further items (NOT built — build only on the stated trigger)

These were considered and intentionally deferred to avoid speculative
over-engineering. Each has a trigger condition; build it when (and only when)
that pain actually shows up.

### A. `--plan-airgap` mode (no network, minimal bash)
A stricter mode than `--plan`: strips bash to a tiny core (`cat grep ls find`
only), zero network, for a defensible "this session could not have exfiltrated
anything" posture — lighter than a container.
- **Trigger:** you need to run plan mode on a specific sensitive deal repo and
  want a no-exfiltration guarantee without spinning up containerization.
- **Effort:** small (a second tool allowlist + flag).

### B. Plan → subagent delegation
Plan mode produces numbered steps; each step is dispatched to a fresh subagent
with a scoped tool set. The pattern that scales multi-part analyses
("pull data → fit decline curve → compare to comp set").
- **Trigger:** you find yourself manually fanning out multi-step analyses and
  wishing each step ran in isolation.
- **Effort:** real engineering; adds a dependency (e.g. `pi-subagents`).
  Re-evaluate the third-party trust surface at that point (PE / sensitive data).

If either gets built, document it above under a Feature-addition heading and
remove it from this list.
