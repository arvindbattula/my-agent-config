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

### Compaction-aware state re-anchoring (`session_compact`, added 2026-06-22, pi v0.79.10)
A `session_compact` listener (added right before the `session_start` handler in
`index.ts`) does two things when plan mode or plan execution is active:

1. **Re-persists plan state past the compaction boundary.** Calls the existing
   `persistState()` so a fresh `plan-mode` entry (current `enabled`/`todos`/
   `executing`, including per-step `completed` flags) is written *after* the
   compaction point. Compaction can summarize away the older `plan-mode` entry,
   the `plan-mode-execute` marker, and the `[DONE:n]`-tagged assistant messages
   that `session_start` re-scans on resume — so without this, a resume *after* a
   compaction could lose execution/completion state. In-memory `todoItems` is
   authoritative for the live session and is untouched by compaction; this only
   protects the resume path. `markCompletedSteps` is additive, so a later
   re-scan can only confirm, never clear, the restored completion.
   - **Also re-emits a silent `plan-mode-execute` marker while executing**
     (`pi.appendEntry("plan-mode-execute", { reanchored: true })`). See the
     "verified non-issue" note below for why this is defensive hardening rather
     than a bug fix.
2. **Reason-aware TUI notification.** Uses the v0.79.10 event fields `reason`
   (`"manual"`|`"threshold"`|`"overflow"`) and `willRetry` to label the toast:
   manual `/compact`, auto-compaction (threshold), `overflow recovery — retrying`
   (overflow + willRetry), or plain `overflow`. Appends remaining-step count
   during execution. Skipped when `!ctx.hasUI`.

The `event` is inferred as `SessionCompactEvent` from the `on("session_compact")`
overload (no import needed) — verified real via `tsc` (a bogus field access
errors TS2339, so `reason`/`willRetry` are genuinely type-checked, not `any`).

**Deliberately NOT done: re-injecting remaining steps for the overflow retry.**
Verified against `dist/core/agent-session.js` (pi v0.79.10) that this would be
redundant/unreliable slop:
- The overflow retry is driven by `agent.continue()` in `_handlePostAgentRun`'s
  while-loop (`_runAgentPrompt`, ~L663). `before_agent_start`
  (`emitBeforeAgentStart`) is emitted **only** inside `agent.prompt()` (~L803),
  never on the `continue()` retry — so it does **not** re-fire on the retried turn.
- But an extension still cannot reach that retry's context: `deliverAs:"nextTurn"`
  is consumed only in `prompt()` (`_pendingNextTurnMessages` read ~L798);
  `deliverAs:"followUp"` lands *after* the run; and after overflow compaction
  `agent.state.messages` is rebuilt purely from the compacted session (~L1581).
- It is also largely unnecessary: the overflowing turn's own
  `plan-execution-context` is the most-recent content and is normally kept past
  `firstKeptEntryId`, and pi's summary template already captures Progress/Next
  Steps, so the retry still sees the plan.
- `session_before_compact`'s extension return contract is only `{ cancel }` or a
  full `{ compaction: { summary, ... } }` replacement; its `customInstructions`
  is an input (passed `undefined` by auto-compaction), so there is no cheap way
  to feed steps into pi's own summarizer without replacing the whole summary.

If a future session re-asks "should plan-mode re-inject after overflow?", the
answer is **no** — re-confirm only if pi changes the retry to go through
`before_agent_start` or adds a continuation-injection delivery mode.

**Verified non-issue + defensive hardening: the `executeIndex === -1` resume
fallback (raised by Copilot on PR #37).** `session_start` bounds its `[DONE:n]`
re-scan to entries *after* the last `plan-mode-execute` marker, to avoid picking
up DONE tags from a previous plan. Copilot noted that if compaction summarizes
that marker away, `executeIndex` falls back to `-1` (scan from the start), which
*could* in principle mark steps completed from stale tags — and that
`persistState()` alone does not re-establish the marker boundary.

Traced against the actual `session_start` logic, this **does not produce a real
bug**, for two independent reasons:
1. **Chronological ordering forbids the dangerous case.** For a stale older-plan
   `[DONE:n]` to corrupt current state, the older tag would have to survive
   compaction while the *newer* `plan-mode-execute` marker is summarized away.
   Compaction keeps a recent suffix (everything after `firstKeptEntryId`) and
   summarizes the prefix. The marker is always chronologically newer than any
   older-plan DONE tags, so if the marker lands in the summarized prefix, every
   strictly-older DONE tag is in that prefix too. You cannot lose the marker
   while retaining strictly-older tags.
2. **The summary is never scanned.** The re-scan loop only collects
   `entry.type === "message" && isAssistantMessage(...)`. The compaction summary
   is a `compaction`-type entry, so even if it contained literal `[DONE:n]`
   text it is skipped. The `-1` fallback therefore only ever scans kept,
   post-boundary, current-plan messages — which `markCompletedSteps` (additive)
   applies harmlessly on top of the already-restored completion state.

Even so, the `session_compact` listener now **re-emits the `plan-mode-execute`
marker** while executing (option C on PR #37). This is belt-and-suspenders: it
re-establishes the scan boundary explicitly past the compaction point so resume
correctness no longer depends on the chronological-ordering invariant above.
The re-emitted marker is a silent `custom` entry (not the displayed
`custom_message` banner); `session_start` detects it via `customType` alone, and
any current-plan DONE tags before it are already captured in the persisted
`plan-mode` entry's `completed` flags, so the tighter scan window loses nothing.

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
- Re-verify the `session_compact` listener after each `pi update`: confirm
  `SessionCompactEvent` still carries `reason`/`willRetry`, and re-check the
  overflow-retry assumptions above if `agent-session.js` compaction/retry flow
  changed (i.e. whether `before_agent_start` now re-fires on the retry).
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
present, prompt `["End execution (clear tracker)", "Keep tracking (still executing)"]`.
"End execution" clears the widget immediately; "Keep tracking"/Escape leaves
it (legitimate mid-plan pause). The fully-tagged path is unchanged (still
auto-finalizes — no regression), and headless/no-UI auto-finalizes rather than
hanging on a select.

**Tradeoff:** if the model pauses mid-plan to ask a clarifying question, the
finalize prompt appears alongside that question (one extra keypress: "Keep
tracking"). Accepted as rare vs. the guaranteed stale-widget bug. If this
friction shows up, switch to auto-finalize-on-idle (clear unless the final
message ends in a question) — lower friction, slightly heuristic.

**Post-PR-review fixes (PR #36, Copilot):**
1. Renamed the finalize option `"Mark plan complete"` → `"End execution (clear
   tracker)"`. The old label was misleading: on an untagged run `finalizePlan`
   posts the neutral "Plan execution ended." header with unchecked items shown,
   so nothing is actually "marked complete". Label now matches behavior.
2. `finalizePlan` restored tools via `normalModeTools ?? <hardcoded list>`, but
   `normalModeTools` is null by the time execution ends (nulled when execution
   started), so it fell back to the hardcoded list and dropped injected tools
   (e.g. Hindsight) — re-introducing the exact regression item #5 above fixed.
   This was pre-existing in the original all-complete branch, but the new
   untagged-finalize path broadens its trigger. Fix: `finalizePlan` always runs
   in normal (non-plan) mode, so the live tool set is already correct — fall
   back to `pi.getActiveTools()` (a no-op that preserves injected tools) instead
   of a hardcoded list. Scoped to `finalizePlan` only; the other two call sites
   keep the hardcoded fallback because there the live tools are `PLAN_MODE_TOOLS`.

### Merged upstream #5940 fixes + tool-preservation reversal (2026-06-23, pi v0.79.10)

The v0.79.10 release fixed the upstream plan-mode **example** (#5940): preserve
active custom tools, skip the action prompt when no plan is found, and queue
refinement/execution follow-ups correctly from `agent_end`. This snapshot was
forked before those landed; the three fixes are now merged in, keeping all
divergences above.

**1. Hindsight (and other injected) tools now stay active DURING plan mode.**
Reverses the earlier design where `pi.setActiveTools(PLAN_MODE_TOOLS)` replaced
the whole set with a hardcoded 6-tool list — which dropped injected tools (e.g.
Hindsight) for the duration of plan mode and only restored them on exit (the
restore was correct via the `normalModeTools` snapshot from item #5 above; the
problem was plan mode itself was tool-starved). Now a `getPlanModeTools(active)`
helper computes `active − {edit, write} ∪ PLAN_MODE_TOOLS`, so memory tools are
available while planning. Used in both `togglePlanMode` and `session_start`.
Matches upstream's `PLAN_MODE_DISABLED_TOOLS` approach.

  **TRADEOFF / open assumption (flagged):** this enables ALL active Hindsight
  tools in plan mode, including *write* ones (`hindsight_retain`,
  `hindsight_delete_*`, etc.), not just read-only recall/reflect. If Hindsight is
  configured against a *remote* server, that is a network/mutation path that the
  bash allowlist (which only guards shell commands) does NOT cover — so plan
  mode is no longer strictly "local read-only" for memory. Accepted per explicit
  request ("we need hindsight memory tools during plan mode"). If a defensible
  no-egress posture is later needed on a sensitive deal repo, restrict plan mode
  to read-only Hindsight tools by name (recall/list/get/reflect) or use
  `--plan-airgap` (deferred item A) — do NOT silently re-broaden.

  The `before_agent_start` plan-mode prompt wording was updated to match: "other
  active tools remain available (… memory tools)" instead of the old "you can
  only use: read, bash, …".

**2. Skip the "what next?" prompt when no plan was extracted.** `agent_end` now
`return`s early when `todoItems.length === 0` (model asked a clarifying question
or only explored), instead of showing an empty-choice select with a dead
"Execute the plan" option. The now-constant `todoItems.length > 0` ternaries
were simplified out.

**3. Execute follow-up queued via `deliverAs:"followUp"` + execution context
inlined in the execute message.** Two linked changes, both grounded in a core
trace (pi-agent-core `dist/agent.js`, v0.79.10):
  - `runWithLifecycle` sets `isStreaming = true`, runs the whole loop INCLUDING
    emitting `agent_end` and awaiting its listeners, and only sets
    `isStreaming = false` in `finishRun()` afterward. **So during the `agent_end`
    handler the agent is still streaming.** A `sendMessage(..., {triggerTurn})`
    there is therefore queued (not run immediately) and drained by
    `_handlePostAgentRun` → `agent.continue()` → `runPromptMessages(...)`, which
    does NOT call `session.prompt()` and so does NOT re-fire
    `before_agent_start`.
  - Because `before_agent_start` does not fire on that first execution turn, the
    remaining-steps list and the `[DONE:n]` tagging instruction are now inlined
    into the `plan-mode-execute` message (matching upstream). The old minimal
    message ("Execute the plan. Start with: X") left the first turn with no
    tagging instruction — a likely contributor to the lingering-widget pattern.
  - Switched the send to `{ triggerTurn: true, deliverAs: "followUp" }` so it
    queues as a follow-up (semantically "run after the agent would stop") rather
    than steering. Added `persistState()` in the execute branch so `executing:
    true` is durable immediately, not only after the first `turn_end`.
  - The Refine path already used `sendUserMessage(refinement, { deliverAs:
    "followUp" })` (without `deliverAs` it would throw while streaming), so it was
    left unchanged.

Verified: `tsc --noEmit --strict` clean against the installed v0.79.10 `.d.ts`.

### Plan-mode root-cause fixes (2026-07-17)

Implemented fixes for the 7 root causes identified in the plan-mode investigation
handoff (`~/outputs/plan-mode-fix-handoff.md`). All fixes are in `index.ts`.

**P0 / RC2 — Stop spamming plan state after every turn.**
`turn_end` previously called `persistState()` unconditionally on every assistant
turn during execution, emitting 90+ identical `plan-mode` custom entries (each
~10-15KB with the full todo list including `rawText`) — ~1.3MB of wasted context
per session. Now `persistState()` is only called when the completion count
actually increases (checked via before/after delta, not just marker presence).

With the new "mark each step immediately" instruction, a 31-step plan yields
~15-31 emits (one per `plan_step_done` call), not the original 90+. Total
context waste drops from ~1.3MB to ~300-450KB — a ~3× reduction. The savings
come almost entirely from the persist-on-change count reduction; the per-event
payload (including `rawText`) is kept intact to preserve resume fidelity.

**P0 / RC1 — Structured `plan_step_done` tool for step completion.**
Registered a new LLM-callable tool `plan_step_done(step: number)` that marks a
plan step as completed and returns the current progress + next step. The tool
is always registered but only added to the active tool set during execution
(via `withPlanStepDone()` / `withoutPlanStepDone()` helpers). This replaces the
ad-hoc `[DONE:N]` text-marker hack (RC6) with a structured mechanism. The
`[DONE:N]` text parsing in `turn_end` is kept as a fallback for backward
compatibility — if the model writes `[DONE:N]` in text, it still works.

The tool's `execute()` returns a properly typed `AgentToolResult<PlanStepDoneDetails>`
with a `details` object (`{ step, completed, total, next }`) for branching
support, plus a text content summary. The `execute()` only calls
`persistState()` when the step wasn't already done (avoids redundant emits
from re-marks). Custom `renderCall`/`renderResult` show the step number and
result in the TUI.

Tool lifecycle management:
- **Execution starts** (`agent_end` Execute branch): `setActiveTools(withPlanStepDone(restore))`
- **Execution ends** (`finalizePlan`): `setActiveTools(withoutPlanStepDone(restore))`
- **Plan mode toggle** (`togglePlanMode`): snapshots filter out the tool via `withoutPlanStepDone`
- **Session resume** (`session_start`): if resuming mid-execution, adds the tool to active set

**P1 / RC4 — Post-compaction auto-resume with plan state injection.**
Two improvements:
1. `session_compact` for `manual` compaction during execution now sends a
   `plan-mode-resume` follow-up message with the full plan state (progress,
   next step, remaining steps, `plan_step_done` instruction). This triggers a
   new turn so the model auto-resumes without the user having to say
   "continue". For `threshold`/`overflow` compaction, the run continues and
   `before_agent_start` re-injects context on the next turn (or the retry
   handles it — see existing AUDIT notes on overflow).
2. `before_agent_start` execution context now shows progress (`15/31 steps
   completed`), identifies the next step explicitly (`Continue with step 16:
   ...`), and instructs the model to use `plan_step_done` instead of
   `[DONE:N]`. This fires on every user-initiated turn during execution,
   including after compaction (non-overflow), giving the model a reliable
   re-orientation point.

**Stale context cleanup (review fix):** The `context` event handler now filters
out old `plan-execution-context` and `plan-mode-resume` messages, keeping only
the latest one during execution and stripping all when execution ends. This
prevents stale "Continue with step N" messages with outdated progress from
accumulating in the transcript — which would partially reintroduce the RC2
bloat the fix was meant to eliminate.

**P1 / RC5 — Structured step-start signal.**
The enhanced `before_agent_start` execution context and the `plan-mode-execute`
message both now explicitly identify the starting step (`Start with step 1:`)
and instruct the model to call `plan_step_done` after each step. This gives the
model a clear, structured signal for which step to work on, replacing the old
pattern where the model just started making edits with no step signal.

**P3 / RC6 — [DONE:N] deprecated in favor of the tool.**
All prompts now instruct the model to use `plan_step_done` instead of
`[DONE:N]` markers. The `[DONE:N]` parsing in `turn_end` and `session_start`
re-scan is kept as a fallback — if a model writes `[DONE:N]` in text, it still
works. The `before_agent_start` context mentions `[DONE:n]` as a fallback.

**P3 / RC7 — Git commit escaping tip.**
Added a tip to the execution message: "For git commits with special characters
in the message, use `git commit -F <file>` instead of `-m` to avoid shell
interpretation errors." Not a plan-mode-specific fix but reduces a recurring
annoyance during plan execution.

**RC3 (output token truncation)** is not directly fixable in the extension —
it's a core Pi issue. However, the RC2 fix (less context waste + trimmed
per-event payload) is the primary mitigation: with less context waste, the
output token budget lasts longer and truncation is less likely. If truncation
still occurs, the RC4 fix (post-compaction resume) ensures the model can
recover.

### Post-review fixes (2026-07-17)

Applied after a thorough code review against the installed v0.79.10 `.d.ts`
files. All fixes are in `index.ts`.

1. **`AgentToolResult` contract violation (P1).** All four `plan_step_done`
   return branches were missing the required `details` field. Added a typed
   `PlanStepDoneDetails` interface (`{ step, completed, total, next }`) and
   included `details` in every return. Verified: `tsc --noEmit --strict` clean
   (no type errors in the file beyond expected module-resolution issues).

2. **Per-event payload: rawText trim reverted (P2).** Initially `persistState()`
   was changed to strip `rawText` from persisted todos to reduce per-event size.
   This was a regression: after a real session resume, `rawText` would be gone,
   degrading the RC4/RC5 prompt injection to use 47-char truncated `text` instead
   of full step descriptions. Reverted — the full `todoItems` (including
   `rawText`) are persisted again. The ~3× context reduction comes from
   persist-on-change, not payload trimming.

3. **Stale context-message accumulation (P2).** The `context` event handler
   now filters `plan-execution-context` and `plan-mode-resume` messages:
   during execution, only the latest one is kept (older ones with stale
   progress are dropped); when execution ends, all are stripped. This prevents
   the per-turn injection from reintroducing the bloat RC2 was meant to kill.

4. **State-delta check in `turn_end` (P3).** Replaced `markCompletedSteps() >
   0` (which counts markers found, not actual state changes) with a
   before/after completion-count delta. A model repeating `[DONE:5]` for an
   already-done step no longer triggers a redundant `persistState()`.

5. **`plan_step_done` re-mark guard (P3).** The tool's `execute()` now checks
   `wasAlreadyDone` before calling `persistState()`, avoiding double-persist
   when the model re-marks an already-completed step.

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
