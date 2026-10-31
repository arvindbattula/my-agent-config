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
  request ("we need hindsight memory tools during plan mode"). For a defensible
  no-egress posture on a sensitive deal repo, use `--plan-airgap` (see Feature
  addition below) — it strips ALL injected tools (including Hindsight) and
  restricts bash to a tiny read-only core. Do NOT silently re-broaden.

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
it's a core Pi issue. However, the RC2 fix (fewer persist calls — only on
actual state changes, not every turn) is the primary mitigation: with less
context waste (~3× reduction from ~1.3MB to ~300-450KB), the output token
budget lasts longer and truncation is less likely. If truncation still
occurs, the RC4 fix (post-compaction resume) ensures the model can recover.

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

## Phase 0 hardening re-baseline (2026-10-22, pi 1.4.0)

### Runtime re-baseline — CRITICAL correction
**The pi that actually runs is the managed install at `~/.pi/agent/install/releases/1.4.0/`** (launched by `~/.pi/agent/bin/pi`), NOT the npm-global 0.84.2 at `~/.feynman/npm-global/` and not the Feynman-bundled 0.84.2 — both are stale secondary installs. The hardening brief (outputs/plan-mode-hardening/index.md) described 0.84.2 as "installed"; that was wrong about which install executes. All future API verification must target `~/.pi/agent/install/current-version`. Plan: `outputs/.plans/plan-mode-hardening.md`.

### Red-team regression harness (new: `tests/`)
`tests/corpus.ts` (92 entries × per-mode tiers = 119 tier-runs) + `tests/run.mjs`. Imports `blockReason`/`airgapBlockReason` directly from `../utils.ts` — the old `pats.mjs` copy in outputs/.tmp is retired as a source of truth.
- `node tests/run.mjs` — gate vs post-Phase-1 targets (33 holes, 7 FPs today — expected until Phase 1)
- `node tests/run.mjs --snapshot` / `--verify-baseline` — pre-change snapshot + drift detection
- **Baseline reproduced the red-team result exactly: 22/28 plan-tier allows** (RT-* subset), discharging the re-run requirement on pi 1.4.0 + live extension code.
- **Newly discovered false positive (GT-15):** `awk 'length > 80 {print}' file` is blocked today because the `>` in the numeric comparison trips the redirect deny `/(^|[^<])>(?!>)/`. Phase 1's quote-awareness must cover redirect detection, not just segmentation. Recorded in the corpus with target=allow.
- The `tests/` dir has no `package.json` and no `index.ts`, so the extension loader (one level, manifest-driven) ignores it — verified against loader.js discovery rules.

### Changelog audit 0.84.2 → 1.4.0 (extension-API affecting)
Beyond the three known items (`before_agent_start` messageType union; `user_bash` fail-closed #9068; dynamic `registerTool` refresh — all already in the plan), notable:
- **1.4.0 #11062:** resumed sessions/`/tree` now activate extension tools the branch never explicitly added unless `defaultActive:false`. Our `plan_step_done` is always registered + activated via `setActiveTools`; `session_start` re-applies tool sets on resume, so behavior is preserved — but re-test `/todos` resume and branch navigation after Phase 1.
- **1.0.0:** warning when an extension replaces a built-in tool; built-in tools are `builtin:*` extensions. Phase 2's bash override may surface this warning — the upstream sandbox example does the same thing, so treat the warning as expected noise, verify it's not an error at Phase 2.
- **0.87.0 #9789:** `context` handlers no longer see system messages; pi restores prompt/tool declarations after they run. Our `context` handler only filters custom types + plan-mode user banners — safe, no change needed.
- **1.1.0 #10739:** the session counts as busy during run start (incl. `before_agent_start` handlers); `sendMessage` queues into the starting run; `sendUserMessage` requires `deliverAs`. Our flows already pass `deliverAs:"followUp"` everywhere they send during handlers — no change.

### Stale-trace re-verification (AUDIT 0.79.10 traces vs 1.4.0 `agent-session.js`)
- **"`agent_end` fires while still streaming; followUp queues via `agent.continue()`"** — STILL HOLDS on 1.4.0 (`sendMessage` with `triggerTurn:true, deliverAs:"followUp"` while `isStreaming` → `agent.followUp()` → drained by `_handlePostAgentRun` → `agent.continue()`; `before_agent_start` is emitted only in `_prepareRun`, never on `continue()` iterations). The RC4 inlined execute context remains the sole context source on that path.
- **"`before_agent_start` never re-fires on the retry"** — still true for in-run retries, but **new on 1.4.0:** when idle, `sendMessage({triggerTurn:true})` starts a fresh run via `_startRun({messageType:"custom"})` → `_prepareRun` → `emitBeforeAgentStart(messageType:"custom")`. Our `plan-mode-resume` (threshold/manual compaction) and any idle-time triggerTurn send will therefore re-fire `before_agent_start`. Without a `messageType` guard our execution-mode branch would double-inject on those runs. **Confirmed necessary: the upstream 1.4.0 example guard `if (event.messageType !== "user") return;` is adopted in Phase 1** (merge-from-upstream, not a divergence revert).

Phase 0 complete per `outputs/.plans/plan-mode-hardening.md`. No production code was modified; `utils.ts`/`index.ts` are untouched as of this entry.

## Phase 1 — segment-aware regex hardening + upstream messageType guard (2026-10-22)

Implements Phase 1 of `outputs/.plans/plan-mode-hardening.md`. All changes gated by
`tests/run.mjs` (117/117 tier-runs at target after the change; drift vs. the pre-change
baseline = exactly the 33 intended hole-closures + 6 false-positive fixes, zero collateral).
`tsc --noEmit --strict` clean against the pi 1.4.0 `dist` type definitions.

### `utils.ts` — architecture change (supersedes the old flat pattern lists)

The old layer was a prefix-anchored allowlist + raw-substring denylist over the whole
command string; it could not model shell composition (`cat x | sh` executed). New layer:

1. **`splitSegments()` (exported):** quote-aware split on unquoted `|`, `||`, `;`, `&&`,
   `&`, newlines. Quote chars are preserved in segment text (sed/awk guards need them).
   **Unbalanced quotes → `parseOk:false` → block** (conservative, e.g. `echo 'unbalanced | sh`).
2. **Every segment must pass:** optional version exception (`node --version`, `python3? --version` — exact
   match only) → no `HEAD_DENY` token as the segment's FIRST WORD (network: curl/wget/nc/ssh/scp/
   socat/telnet/dig/nslookup/host/ftp/sftp/ssh*; interpreters: sh/bash/zsh/dash/ksh/python\d*/node/
   perl/ruby/osascript/deno/php/lua/tclsh) → an allowlisted head → no per-command `FLAG_GUARDS` hit.
3. **`FLAG_GUARDS`:** sed `e/w/r` commands + s-flags `w/e` (exec/write), awk
   `getline`/`system(`/`|&`/`/inet/`/`print >`/`print |`, sort `-o|--output`, git
   `--output|--ext-diff|-c` (config injection → pager/alias second stage).
4. **`hasUnquotedRedirect()`:** `>`/`>>` blocked only OUTSIDE quotes. Fixes the GT-15 false
   positive (`awk 'length > 80 {print}'` — the `>` is a comparison inside single quotes).
   Behavior change: quoted `>` in output text (`echo "a>b"`) is now allowed (correct — it
   is not a redirect).
5. **`DESTRUCTIVE_PATTERNS` (whole-command, substring):** all the pre-existing entries kept
   EXCEPT: network words (→ head-deny, fixing `cat ~/.ssh/id_rsa`), `>`/`>>` (→ quote-aware
   redirect), `perl`/`ruby` (→ head-deny). Added `<(` (process substitution — `cat <(cmd)` runs
   a subshell; caught by inspection during design).
6. **`PLAN_SAFE_HEADS` changes vs old `SAFE_PATTERNS`:** removed `less`/`more` (pagers; no TTY
   in pi's bash — closes `!cmd`/`-o logfile` class for free); removed `npm view|info|search|
   outdated|audit` + `yarn list|info|why|audit` (registry egress; hostile `.npmrc` redirect —
   keeps `npm list|ls` local-only); `env` → exact bare `env` only (kills `LD_PRELOAD`, `PAGER=sh`,
   `GIT_PAGER=sh` injection); `node/python --version` moved to `VERSION_EXCEPTIONS` (and
   `python3 --version` added — previously blocked by the old regex).
7. **`blockReason()`** now reports segment-indexed reasons: `segment 2: interpreter/exec escape
   not allowed — sh` — the model gets the exact offending part. `airgapBlockReason()` keeps its
   specific message; generic allowlist misses in airgap get the tiny-core message as before.
8. `isSafeCommand`/`isAirgapSafeCommand` keep their signatures (now thin wrappers over
   `commandReason`; the tests import them).

**Known remaining UX friction (deliberate, unchanged from pre-Phase-1):** unquoted `2>/dev/null`
is still blocked (it contains an unquoted `>`; `2>/tmp/x` writes a file, and allowing only the
`/dev/null` spelling felt like scope creep for this phase). Revisit if it hurts.

### `index.ts` — two changes

1. **Upstream 1.4.0 guard merged (a447ba1-class fix, from the upstream example L204):**
   `pi.on("before_agent_start", (event) => { if (event.messageType !== "user") return; … })`.
   On pi 1.4.0, `before_agent_start` also fires for `pi.sendMessage({triggerTurn:true})`
   idle-started runs (messageType `"custom"`); our `plan-mode-resume`/execute messages inline
   their own context, so without the guard those turns would be double-injected. Verified
   against 1.4.0 `agent-session.js` (see Phase 0 entry). This is a **merge from upstream**, not
   a divergence revert — all other AUDIT divergences stand.
2. **`terminate: true`** on blocked bash `tool_call` results: an all-terminating batch whose every
   blocked call sets this skips the automatic follow-up model call (pi ≥0.84.1 feature) — the
   model stops churning retries against the wall.

### Rollback
`tests/pre-phase1/{utils,index}.ts.pre-phase1` hold the pre-Phase-1 files; `cp` back and re-run
`node tests/run.mjs --verify-baseline` (expect the inverse drift). Corpus gate before this
change: 33 holes / 7 FPs; after: 0/0.

### Phase 1 process note (caught during Phase 1b verification)
The Phase 1 edit batch that added the `messageType` guard + `terminate: true` failed
**atomically** (the tool rejected the second hunk, and the first was not applied either);
the retry only restored `terminate: true`. The guard was silently missing until Phase 1b's
diff-against-backup verification caught it (expected 6 hunks, found 5). Lesson recorded:
**every phase must diff against its backup and count hunks** — a "replaced successfully"
once is not proof for multi-edit batches. Guard applied and verified present at index.ts L492.

## Phase 1b — prompt-instruction upgrade, neuron-library-informed (2026-10-22)

Prompt strings only; zero logic changes (diff vs. pre-Phase-1 backup: 6 hunks, all in the
two `before_agent_start` prompt blocks + the Phase 1 guard/terminate already logged).
Implements Phase 1b of the plan; patterns sourced from the owner's neuron-library cards
(via the neuron-library MCP; full mapping in the plan file's Appendix):

1. **Clarify-first as an explicit phase** (Plan/Spec Mode c_51a5dafaf3, Grill Me c_f69a877928,
   Blind Spot Pass c_bd8fbd0f12): the plan-mode prompt now instructs the model to interview
   the user via the questionnaire BEFORE planning — highest-leverage questions first, capped
   at 5–10, "stop when nothing material is left open" (the abstain discipline from Phase 4's
   evidence base, applied to questioning).
2. **Richer plan format** (Ultraplan c_b31f018629): steps must name touched files; architectural
   tasks require 2–3 approaches with tradeoffs + a recommendation; a short "Risks:" section
   including "what will fight this plan."
3. **Self-review before presenting** (c_51a5dafaf3 phase 3, c_bf25974278, c_bb2edfd0af):
   re-check against stated goals, flag the least-confident step.
4. **Per-step done-when/Verify format** (Define-Done c_a7b6d9062d, Goal-not-prompt c_1c53dadf98):
   `N. <action> - done when: <condition> [Verify: <command>] (files: <paths>)`. The suffixes are
   inert until Phase 3 parses them (`extractTodoItems` verified compatible: rawText keeps the
   full line; display text truncates as before; Risks section ignored — tested).
5. **Airgap prompt**: same 4-phase shape, compressed, memory-tool wording unchanged.

Markers `[PLAN MODE ACTIVE]` / `[AIRGAP PLAN MODE ACTIVE]` kept identical (the `context`
filter strips on those substrings). `tsc --noEmit --strict` clean; corpus gate 117/117
(prompt layer is regex-invisible by design — the phase gate is a human live-session review).

**Live-session test for the owner (the Phase 1b gate):** start a fresh pi session, run `/plan`,
and give it a multi-file task (e.g. "add a retry wrapper around the fetch calls in this repo").
Check: (a) it asks clarifying questions FIRST via questionnaire, (b) steps name files,
(c) a Risks section appears, (d) it flags its least-confident step. Rollback: revert the two
prompt blocks (diff hunks above).

## Phase 2 — kernel enforcement via @anthropic-ai/sandbox-runtime (2026-10-22)

Implements Phase 2 of the plan. Plan/airgap bash now runs inside an OS-level sandbox; the
Phase 1 regex layer stays in front as advisory UX. Verified: sandbox tier 11/11, corpus gate
117/117, `tsc --noEmit --strict` clean (incl. sandbox.ts), and a LIVE headless session
(`pi --plan-airgap -p …`) where `cat ~/.ssh/config` was allowed by the regex and denied by the
kernel ("Operation not permitted") while normal reads worked.

### New files
- **`package.json`** — `pi.extensions` manifest (loader now loads via manifest, not index.ts
  auto-discovery; same entry) + `@anthropic-ai/sandbox-runtime` pinned **0.0.81** (latest at install;
  the brief's ≥0.0.43 floor was for the SOCKS5 null-byte fix — upstream example still pins the
  vulnerable 0.0.26; do not copy it).
- **`sandbox.ts`** — policy builders + lifecycle (`ensureSandbox`/`teardownSandbox`/`isSandboxReady`,
  policy-keyed so plan↔airgap switches reset+reinit) + `createSandboxedBashOps()` copied verbatim
  from the upstream example (preserves `detached:true` + process-group SIGKILL timeouts — the
  pattern is byte-identical in the 0.84.2 and 1.4.0 installs).

### Empty-list semantics — the CVE-2025-66479 question, resolved empirically
The plan required probing deny-all semantics rather than trusting empty lists. On 0.0.81 /
macOS 15.7.7: `network.allowedDomains: []` + `filesystem.allowWrite: []` IS accepted and
**enforced** — write probe: "Operation not permitted"; egress probe: curl 000/reset while the
unsandboxed control gets 200. The credentials schemas reject explicitly-empty lists outright
("an explicitly empty list is rejected" in the .d.ts) — the empty-list footgun class is now a
validation error upstream. Also: the managed `TMPDIR=/tmp/claude` scratch dir does NOT exist in
our posture → effectively full write-deny, including /tmp.

### index.ts integration (17 hunks, all diffed & counted — see Phase 1b process note)
- `registerTool` override of built-in `bash` (extension tools win — verified 1.4.0 registry):
  sandboxed ops while (plan|airgap) && sandbox-ready; otherwise untouched passthrough.
- `pi.on("user_bash")` → sandboxed ops in planning modes, **`undefined` otherwise** (1.4.0
  fail-closed semantics — any invalid defined result would abort the user's command).
- `activateSandboxForMode(ctx)` on: plan enter, airgap enter, airgap→plan downgrade (policy
  switch), session_start mode restore. `teardownSandbox()` on: plan/airgap exit, execute
  branch, `session_shutdown`.
- **Airgap fails closed:** if the sandbox is not ready, ALL bash is blocked (with
  `terminate:true`); `--no-plan-sandbox` is the operator's explicit escape hatch.
- Plan mode fails OPEN to the regex layer with visible warnings (status shows `⏸ plan` without
  the 🔒 when unsandboxed; airgap shows `⚠︎ no-sandbox`).
- `togglePlanMode`/`toggleAirgapMode` became `async` for sandbox init — all call sites were
  already async handlers.
- Plan-mode `denyRead` opt-in: `<cwd>/.pi/plan-mode.json` `{ "denyRead": [...] }` (only
  narrows; never widens; parse failure = no extra restrictions). Airgap `denyRead` is FIXED:
  `~/.ssh`, `~/.aws`, `~/.gnupg`, `.env`, `.env.*`, `*.pem`, `*.key` (owner decision (b)).

### Tests
- `node tests/run.mjs --sandbox` — Tier 3: 11 probes incl. the regex-bypass write vectors
  (`sh -c`, `git diff --output`, `sort -o`) sent DIRECTLY through sandboxed ops, bypassing the
  regex on purpose; policy-switch reinit; airgap `~/.ssh`/`~/.aws` read denial.
- One probe bug found & fixed during the phase: `curl -w NETOK` prints the format string even on
  failure — the network probe now checks `%{http_code}` (000 when denied) with an unsandboxed
  control (skip-safe offline).

### Rollback
1. `pi --no-plan-sandbox` — runtime kill switch (regex layer remains).
2. Full: revert `index.ts` from `tests/pre-phase2/`, delete `sandbox.ts` + `package.json` +
   `node_modules/`, re-run `node tests/run.mjs` (regex gate must stay 117/117).

## Phase 3 — verified step completion (2026-10-22)

Implements Phase 3. `plan_step_done` is now a PROPOSAL: steps carrying a `[Verify: <command>]`
check complete only when the HARNESS runs the check and it exits 0. The model cannot run,
intercept, or author the execution of its own verifier (Claude Code `TaskCompleted` exit-2
semantics; SpecBench/EvilGenie's reward-hacking lesson). Verified: `tests/phase3.mjs` ALL
PASS (14 checks), corpus 117/117, sandbox tier 11/11, tsc strict clean; diff vs.
`tests/pre-phase3/`: 19+5 hunks, all counted and reviewed.

### `utils.ts`
- `TodoItem` gains `doneWhen`, `files`, and `check { command, hash, redWitnessed?, verified?,
  failStreak? }`. Backward-compatible: persisted legacy plans simply lack the fields.
- `extractTodoItems` parses the Phase 1b step format — `N. <action> - done when: <cond>
  [Verify: <cmd>] (files: <paths>)` — suffixes optional, order-tolerant; display text is now
  action-only (cleaner widget); rawText keeps the full line (checked in tests).
- `checkHash(step, command)` — sha256/16 of `step|command`, computed at extraction: stable
  across re-extraction (tested), the audit/lock trail.
- `loadPlanModeConfig(cwd)` — `.pi/plan-mode.json` `{ verifySteps (default true), defaultCheck,
  denyRead }`; invalid JSON/missing file → safe defaults. `sandbox.ts`'s denyRead loader now
  delegates here (single source of truth).

### `index.ts`
- `runCheck()` — harness-side check execution via `node:child_process` (NOT the model's bash
  tool): detached process group, SIGKILL on 120s timeout, output capped at 4KB for tool
  feedback. Checks run with full user privileges during execution mode — same trust level
  as all executed work; the user reviews the visible `Verify:` commands in the plan before
  approving.
- `plan_step_done.execute`: with `verifyStepsOn && item.check && !item.completed`, runs the
  check first. Fail → `isError: true` + check output + attempt count; step stays incomplete;
  `failStreak` persists across resume. Success → `check.verified = true`. **Cap: 8 consecutive
  failures** pauses the step and instructs the model to ask the user (Loop Engineering's
  verify→retry→escalate graph — escalation is a designed transition, not a failure).
- `evidence` parameter (optional string) + evidence line in every result — harness evidence for
  verified steps, explicitly-labeled model-reported evidence otherwise (c_a7b6d9062d,
  c_299c49b1de, c_3b4b5c126f).
- **Blind-spot audit** on plan completion (c_cace25de50, c_0b0b5f27b6): the final result
  text asks for least-confident step / riskiest assumption / one user verification.
- **Red-witness at approval** (Execute branch): all checks run once pre-work; failures recorded
  as `redWitnessed` (TDD red state); already-green checks noted as such. `verifyStepsOn` cached
  from config at approval.
- **Check-locking on resume** (`session_start`): each persisted check's hash is re-verified
  against its command; mismatch → loud warning + check disabled (never silently trusted).
- UI: `✓✓` verified vs `☑` reported in the widget; footer gains `(n✓)`. Exec message and
  execution context gained one check-instruction line each.

### Not automated (honest scope note)
The full `plan_step_done` gating loop can't run headless (the Execute flow needs interactive
UI). Unit tests cover extraction/hash/config; `runCheck`'s spawn pattern is the same as the
Phase 2 ops (proven live). Manual live gate for the owner: run `/plan` on a real task with at
least two steps, one carrying a check that starts out failing, e.g. `[Verify: test -f done.flag]`.
Try `plan_step_done` → expect refusal + attempt counter; create the flag and retry → passes →
`✓✓` in widget. Changing the check itself can't work: Refine exists only before Execute, and
checks are hash-locked. With a one-step plan the widget is replaced by "Plan Complete!" at once,
so `✓✓` never shows.

### Rollback
`cp tests/pre-phase3/{index,utils}.ts .` restores pre-Phase-3 state; `"verifySteps": false` in
`.pi/plan-mode.json` disables gating at runtime instantly (steps become reported-only again,
exactly pre-Phase-3 semantics); corpus/sandbox/phase3 suites must all re-pass after any revert.

## Phase 4 — trigger assist (2026-10-22)

Final phase. A single non-blocking "consider /plan?" nudge per session. Deliberately
manual-first: NO auto-router (the one independently measured attempt missed 81% under
ambiguity; blast-radius cues barely reduce action propensity — routing must stay with the
human). 4 hunks vs. `tests/pre-phase4/` (import, handler block, prompt line; 1 utils hunk).

- **`utils.ts` `shouldSuggestPlan(text)`** (pure, tested): suggest = keyword hit
  (refactor/migrat\w+/restructure/redesign/rewrite/rework/architect\w*/overhaul/multi-file/
  "several files"/"many files"/"across the repo") OR ≥3 DISTINCT file-ish mentions (path or
  extension tokens, deduped). Abstain = <40 chars, explicit directness markers ("just",
  "quickly", "quick fix", "one-liner", "straight to", "don't plan", "no plan", "trivial"),
  or neither trigger. The abstain class is the design (Cursor's keyword approach is the
  existence proof; the DIY router-hook lesson is "when unsure, don't nag").
- **`index.ts` `pi.on("input")`**: fires only for `source === "interactive"`, not for slash
  commands, never while in plan/airgap/execution mode, `planNudgeFired` latches once per
  session EVEN IF IGNORED (anti-spam), notify only — no mode change, no context edit.
  Returns `undefined` (input event must not be transformed).
- **Self-routing line** in the plan-mode context prompt (EnterPlanMode pattern): the model
  recommends /plan for multi-file work it meets outside plan mode.
- **Stretch BUILT (owner approval 2026-10-22):** Refine → Grill-Me questionnaire
  interview (c_f69a877928). "Refine the plan" now asks HOW: "Interview me first
  (questions until we're aligned)" — the model walks each branch of the design tree via
  the questionnaire (highest-leverage first, capped at 10-15 questions — the raw skill's
  40–100 is for greenfield interviews, not refinement), then rewrites the plan in the
  Phase 1b format; or the original free-form editor. Delivered as a follow-up user message
  (agent_end still counts as streaming); the agent_end extraction flow re-runs naturally
  after the updated plan, returning to the Execute/Stay/Refine prompt.

Verified: `tests/phase4.mjs` 12/12 (hit/abstain matrix incl. dedup and directness markers);
full battery green (corpus 117/117, sandbox 11/11, phase3 ALL PASS, tsc strict clean).
Manual no-spam check for the owner: in a fresh session, send a refactor-shaped prompt of 40+
characters → one hint; send another → silence. In a second fresh session, send a 40+ character
prompt with a keyword and a directness marker → no hint. A later "just fix X quickly" in the
first session proves nothing: the latch silences everything, and it is under the 40-char minimum.

### Rollback
Remove the `pi.on("input")` block + the import + the prompt line (`tests/pre-phase4/` has
the pre-phase files); `shouldSuggestPlan` in utils.ts is inert without the handler.

## Live gate results (2026-10-30, pi 1.4.0)

- **Verify gate: pass.** Real pi in a terminal with a scripted model, Linux container. First
  `plan_step_done` refused ("attempt 1/8"), accepted after the flag existed, `✓✓` in the widget,
  footer `1/2 (1✓)`.
- **No-spam nudge: pass.** Same setup. Session 1: one hint after the first prompt, none after the
  second. Session 2: no hint for a keyword prompt with a directness marker.
- **Clarify-first: partial pass.** Real model (valar, GLM-5.2), 3 vague prompts with `--print`.
  In a clean project all three ended in clarifying questions with no plan.

Findings from the clarify-first run, not yet fixed:
1. **`questionnaire` does not exist.** The tool is not defined in this repo or the installed
   extensions, yet the plan prompts and the Refine interview tell the model to use it. The model
   fell back to plain-text questions. In `--print` there was no way to answer them.
2. **Explore runs before Clarify.** The model read the code first on every prompt, despite the
   numbered phases. Reasonable behaviour, but not what the prompt says.
3. **A blocked command ends the turn.** In one run, a compound `for` loop hit the allowlist and
   `terminate: true` stopped the session with no questions and exit 0.

## Post-phase fix — /dev/null sink carve-out (2026-10-22, owner-approved)

Resolves the "known UX friction" noted in the Phase 1 entry: `hasUnquotedRedirect()` now
skips redirects whose destination is exactly `/dev/null` (`2>/dev/null`, `2>>/dev/null`,
`>/dev/null`, `&>/dev/null`) — the null device is a sink, not a file, so these write nowhere.
A lookahead (`(?![\w./-])`) keeps `2>/dev/null.txt` and continued paths blocked. Still blocked,
deliberately (outside the approved scope): `2>&1` and every real-file redirect.
Corpus: SN-01..SN-05 added (allow ×3, block ×2 proving no leak) — gate 127/127.
Kernel sandbox unchanged (writes are denied at the OS level regardless).
Rollback: revert the `hasUnquotedRedirect` function; SN-* corpus entries document the split.

## Feature addition: `--plan-airgap` mode (2026-07-17)

Implements deferred item A. Airgap is a **modifier on plan mode**, not a
parallel mode: `airgapMode === true` implies `planModeEnabled === true`. It
reuses all existing plan-mode machinery (bash blocking hook, plan extraction,
execute/refine flow, compaction re-anchoring, session resume) and tightens two
things:

1. **Tool set:** a **fixed closed whitelist** (`AIRGAP_MODE_TOOLS` = `read`,
   `grep`, `find`, `ls`, `questionnaire`, `bash`). Unlike `getPlanModeTools()`
   which *unions* with active tools (preserving injected tools like Hindsight),
   `getAirgapModeTools()` returns a **fixed list and ignores the active set**.
   This is the inversion that closes the Hindsight-egress gap: every
   non-baseline tool (all `hindsight_*`) is stripped, since even a
   `hindsight_recall` query is data leaving the machine.

2. **Bash allowlist:** a tiny read-only core (`cat`, `grep`, `ls`, `find`,
   `head`, `tail`, `wc`, `pwd`) via `AIRGAP_SAFE_PATTERNS` + `airgapBlockReason()`,
   much smaller than the broad `SAFE_PATTERNS` used in normal plan mode.

### Tool policy summary

| Tool | `--plan` | `--plan-airgap` |
|---|---|---|
| `read` | ✅ | ✅ |
| `grep` / `find` / `ls` | ✅ | ✅ |
| `questionnaire` | ✅ | ✅ |
| `bash` | ✅ broad read-only allowlist | ✅ **tiny core only** |
| `edit` / `write` | ❌ | ❌ |
| Hindsight / injected tools | ✅ **preserved** | ❌ **stripped** |

### Entry points
- `--plan-airgap` CLI flag (airgap wins if both `--plan` and `--plan-airgap` are passed)
- `/plan-airgap` command
- `Ctrl+Alt+A` shortcut

### Mode interaction (D2)
Plan and airgap are **mutually exclusive, last wins**. The transition paths are:
- `/plan` from normal → enters plain plan mode.
- `/plan-airgap` from normal → enters airgap mode (snapshots full tool set).
- `/plan-airgap` from plan → **upgrades** to airgap (preserves the existing
  `normalModeTools` snapshot — does NOT re-snapshot the restricted plan set).
- `/plan` from airgap → **downgrades** to plain plan mode (restores memory tools,
  keeps bash read-only). Does NOT exit to normal mode.
- `/plan` or `/plan-airgap` from the same mode → exits to normal mode (toggle off).

This means `/plan` from airgap loosens restrictions rather than exiting, which
matches the upgrade/downgrade intent of D3.

### Scope boundary (IMPORTANT)
The no-exfiltration guarantee holds **only while in airgap plan mode**.
Executing a plan restores full tools (edit/write/network/memory). An explicit
confirmation prompt appears on execute-from-airgap so the transition is
guarded.

### Pre-existing `find` write-flags gap (also hardened in normal `--plan`)
While writing the airgap spec, found that `DESTRUCTIVE_PATTERNS` blocked
`-exec` but NOT `-delete`, `-execdir`, `-ok`, `-okdir`, `-fprintf`, `-fprint`,
`-fprint0`, `-fls`. So `find . -delete` or `find . -fprintf /tmp/out …` passed
the read-only allowlist. Added all missing patterns to `DESTRUCTIVE_PATTERNS`
— this hardens both normal `--plan` and `--plan-airgap`.

### Pre-existing `/dev/tcp` `/dev/udp` egress gap (found in PR review)
Bash's `/dev/tcp/host/port` and `/dev/udp/host/port` pseudo-files allow
network egress via any file-reading command (`cat /dev/tcp/host/port`),
bypassing the `curl`/`wget`/etc. network block. Added `/dev/tcp` and
`/dev/udp` to `DESTRUCTIVE_PATTERNS` and a specific block reason in
`blockReason()`. This hardens both normal `--plan` and `--plan-airgap`.

### Persist-on-toggle (found in PR review)
`togglePlanMode` and `toggleAirgapMode` update in-memory state but did not
call `persistState()`, so a session resume could restore stale mode state
(e.g. `airgap: true` after a downgrade to plain plan). Both toggle functions
now call `persistState()` after updating state, including the airgap→plan
downgrade path.

### Open decisions resolved
- **D1:** Bash core = `cat grep ls find` + `head tail wc pwd` (all read-only,
  zero egress/mutation risk).
- **D2:** Mutually exclusive, last wins.
- **D3:** Yes, upgrade from plan to airgap mid-session (free via toggle).
- **D4:** `Ctrl+Alt+A` shortcut registered.
- **D5:** Deferred — all Hindsight tools stripped in airgap, always. "No egress"
  means no egress, period. Can revisit if local-Hindsight detection is needed.

## Deferred / push-further items (NOT built — build only on the stated trigger)

These were considered and intentionally deferred to avoid speculative
over-engineering. Each has a trigger condition; build it when (and only when)
that pain actually shows up.

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
