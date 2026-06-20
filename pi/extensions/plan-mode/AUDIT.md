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
