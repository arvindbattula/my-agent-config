# Pi Extensions

Extensions for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent) — auto-discovered from `~/.pi/agent/extensions/` (synced by `install.sh`).

## Extensions

### `lib/azure-token.ts`
Shared Entra ID token acquisition utility used by both Azure extensions. Caches tokens per resource with automatic refresh. Not a standalone provider — imported by the other extensions. Lives under `lib/` on purpose: pi auto-loads **every top-level file** in `extensions/` as an extension (each must export a default factory), so shared helpers must sit in a subdirectory. A subdir without an `index.ts` or a pi-manifest `package.json` is ignored by pi's loader but stays importable (e.g. `from "./lib/azure-token"`).

### `statusline.ts`
Two-line status bar footer showing model, directory, git branch + diff stats, thinking level, and a stats line with context usage (`42%/200k (auto)` — or `?/200k` right after compaction), token breakdown (`↑ ↓ R W`), cache-hit rate (`CH%`), cost, and session elapsed time.

Cost and token stats aggregate over **all** session entries — assistant, toolResult, standalone `usage` entries (e.g. cache warming), compaction, and branch_summary — matching pi's built-in footer and `/stats`, and are memoized on `(sessionId, leafId, entryCount, model)` like pi's `getSessionStats()` (entry count alone goes stale after `/fork` or a model switch). Extension statuses are sanitized (control chars stripped) and sorted alphabetically, matching pi's built-in footer.

### `lib/session-stats.ts`
Pure helpers for `statusline.ts` — usage aggregation, compact token formatting, status-text sanitization. Lives under `lib/` so pi's auto-loader ignores it (see the `lib/azure-token.ts` note) and it stays unit-testable standalone: `session-stats.test.mjs` asserts cost/token parity against pi's own `getUsageCostBreakdown` (the `/stats` oracle) over a synthetic session containing every usage-bearing entry type, including `cache_warm`.

### `azure-foundry.ts`
Anthropic-compatible provider for Claude models deployed through Azure AI Foundry. Discovers models dynamically via ARM API at startup; falls back to a local cache when ARM is unreachable.

**Requires these environment variables:**
- `AZURE_FOUNDRY_BASE_URL` — Anthropic API endpoint
- `AZURE_FOUNDRY_ARM_SUBSCRIPTION` — Azure subscription GUID
- `AZURE_FOUNDRY_ARM_RESOURCE_GROUP` — Azure resource group name
- `AZURE_FOUNDRY_ARM_ACCOUNT` — Azure Cognitive Services account name

Auth uses Entra ID via `az cli`.

Model specs (`MODEL_SPECS`) are sourced from pi-ai's bundled `anthropic.json` catalog — context window, max tokens, reasoning flag, cost, `thinkingLevelMap`, and adaptive-thinking mode all match the catalog entry for each model. A regression test (`azure-model-specs.test.mjs`) asserts field-by-field parity to prevent drift. Unknown Claude deployments emit a console warning instead of silently degrading to defaults.

### `lifecycle-guards/`
Lifecycle guards extension that ports the Claude Code bash hooks to Pi's extension event system. Provides the same rules in both runtimes, apart from the differences listed under **Claude Code and Pi differences** below:

- **Session context** (`before_agent_start`) — injects workflow reminder at session start.
- **Protected paths** (`tool_call: write/edit`) — blocks edits to `.env` and `.env.*` files and `.git` at any depth, `generated/` at the project root, and paths outside the project root.
- **Command policy** (`tool_call: bash`) — blocks destructive shell commands (`rm -rf /`, `DROP TABLE`, `cat .env`, force-push to main/master).
- **Memory compression** (`tool_result: write`) — compresses prose in `memory/*.md` files (removes filler words, replaces verbose phrases, preserves code/URLs/headings/frontmatter).
- **Design antipattern check** (`tool_result: write/edit`) — detects AI-tell patterns in frontend files (pure black/white, HSL, purple gradients, Inter/Roboto fonts, side-stripe borders, gradient text). Tracks each failing file independently (fixing one file never masks another) and mirrors state to `.hook-state/last_design_gate.json` for observability.
- **Completion gate** (`agent_end`) — queues a follow-up message while any frontend file still fails, with a circuit breaker (max 3 follow-ups) that re-arms when the failing set changes. State is in-memory, so it is scoped to the current session and can never carry a stale block into a fresh one.
- **Audit record** (`session_shutdown`) — appends a JSONL line to `reports/session-audit.log`.

**State files** (per-project, gitignored):
- `.hook-state/last_design_gate.json`
- `reports/session-audit.log`

**Interaction with plan-mode:** Both extensions listen to `tool_call`. Plan-mode returns early when not in plan mode. When plan mode is active, both handlers run — if either blocks, the tool is blocked. The command policy here is a subset of plan-mode's restrictions, so plan-mode's stricter checks block first.

**Claude Code and Pi differences:**

| Area | Claude Code hooks | Pi lifecycle-guards |
|---|---|---|
| Project root | `cwd` plus `CLAUDE_PROJECT_DIR`, because a Bash `cd` moves `cwd` | `ctx.cwd` only, because Pi's `cd` doesn't persist between commands |
| Paths outside the project | Allows the session scratchpad, plan files and auto-memory | No exemptions |
| Design anti-patterns | Blocks before writing, and checks after | Checks after writing only |
| Finishing with failing files | Blocks once, then lets the retry finish | Queues up to 3 follow-ups, re-armed when the failing set changes |
| `.hook-state/` and `reports/` location | Project root | `ctx.cwd` |

**Tests:** `node pi/extensions/lifecycle-guards/lifecycle-guards.test.mjs` (79 unit tests for pure logic in `utils.ts`). The Claude Code side has a matching behavioral harness: `bash hooks/hooks.test.sh` (116 assertions across six hooks, including command-policy parity, per-file gate tracking, cross-session staleness, and the project root after `cd`).

### Test files

| File | Checks | What it guards |
|---|---|---|
| `azure-stream-result.test.mjs` | 23 | `result()` contract without iteration; retry loop on transient HTTP; abort-aware backoff; stop-reason mapping; pending fallback for partial streams |
| `lifecycle-guards/lifecycle-guards.test.mjs` | 79 | Pure-logic unit tests for all guard rules |
| `azure-model-specs.test.mjs` | 75 | `MODEL_SPECS` parity with pi-ai's bundled `anthropic.json` (context, maxTokens, reasoning, cost, thinkingLevelMap, adaptive) |
| `azure-reasoning-effort.test.mjs` | 10 | `reasoning_effort` sent from `options.reasoning` with clamping; `off`/undefined omitted; non-reasoning model excluded |
| `session-stats.test.mjs` | — | `computeSessionTotals` cost/token totals parity with pi's `getUsageCostBreakdown`; `formatTokens`/`sanitizeStatusText` |
| `statusline.test.mjs` | 5 | `render()` does not crash when ExtensionAPI lacks `getSettings()` (feynman's bundled pi 0.84.x); ` (auto)` marker honors `compaction.enabled` when present. Uses `statusline-test-hook.mjs` to alias `@earendil-works/pi-tui` |
| `plan-mode/tests/run.mjs` | — | Red-team corpus gate for the bash allowlist. `--sandbox` runs the kernel probes |
| `plan-mode/tests/phase3.mjs` | — | Verified step completion: check extraction, hashing and config |
| `plan-mode/tests/phase4.mjs` | — | Trigger-assist hit and abstain cases |
| `plan-mode/tests/sandbox-init-failure.mjs` | — | Sandbox startup failures name the packages to install |

### `plan-mode/`
Read-only exploration mode with plan tracking, step completion, and post-compaction auto-resume. See `plan-mode/README.md` for full details. Depends on `@anthropic-ai/sandbox-runtime`, which `install.sh` installs with `npm ci`. Linux also needs the prerequisites in that README for the kernel sandbox.

### `questionnaire.ts`
The tool plan mode uses to ask you structured questions: clarifying, Refine's interview and paused steps. Copied from Pi 1.4.0's `examples/extensions/questionnaire.ts`, because Pi doesn't register it by default. Compare it with the example after a Pi update. Outside the terminal UI (`--print`) it returns an error, so the model has to ask in plain text.

### `zz-auto-continue/`
Queues a continuation message after non-retrying compaction so the agent keeps going without manual "continue." Circuit breaker: max 5 auto-continues per user-initiated run.

**Interaction with plan-mode on compaction:** The `zz-` prefix ensures this extension loads after `plan-mode` (extensions load in directory-name order). In plan-mode *execution* sessions, both extensions queue a continuation on `session_compact`. The `hasPendingMessages()` guard in zz-auto-continue does NOT detect plan-mode's queued message because plan-mode uses `pi.sendMessage()` (custom-message path) which does not increment `pendingMessageCount`. This double-queue is harmless — both messages are "continue" variants, the agent processes them in order, and both extensions have circuit breakers. The guard is kept as a best-effort skip for extensions that use `pi.sendUserMessage()` (which does increment `pendingMessageCount`).

### `azure-openai-models.ts`
OpenAI-compatible provider for non-Claude models (DeepSeek, Kimi, etc.) deployed as serverless MaaS on Azure AI Foundry.

**Requires these environment variables:**
- `AZURE_FOUNDRY_OPENAI_BASE_URL` — OpenAI-compat API endpoint
- `AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID` — Deployment ID for DeepSeek model
- `AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID` — Deployment ID for Kimi model

Auth uses Entra ID via `az cli`. Models are defined statically — add new deployments by editing the `MODELS` array in the source. Kimi's `thinkingLevelMap` uses explicit `null` values for unsupported levels (minimal, xhigh, max) so pi's UI only offers the levels Kimi actually supports. `reasoning_effort` is read from `options.reasoning` (the `SimpleStreamOptions` field), not the internal `reasoningEffort` field that pi-ai's wrapper computes.

## Setting Up on a New Machine

```bash
# 1. Clone and sync the agent config
git clone https://github.com/arvindbattula/my-agent-config.git
cd my-agent-config
./install.sh --force

# 2. Set Azure environment variables (use your actual values)
export AZURE_FOUNDRY_BASE_URL="https://your-account.services.ai.azure.com/anthropic/v1"
export AZURE_FOUNDRY_OPENAI_BASE_URL="https://your-account.services.ai.azure.com/openai/v1"
export AZURE_FOUNDRY_ARM_SUBSCRIPTION="your-subscription-guid"
export AZURE_FOUNDRY_ARM_RESOURCE_GROUP="your-rg"
export AZURE_FOUNDRY_ARM_ACCOUNT="your-account-name"
export AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID="your-deepseek-deployment-id"
export AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID="your-kimi-deployment-id"

# 3. Log in to Azure CLI
az login
```

On Linux, also install the kernel sandbox prerequisites in `plan-mode/README.md`, or airgap mode blocks all bash.

## Design Notes

- **No Azure identifiers in version control.** All subscription IDs, resource group names, account names, and endpoint URLs are configured via environment variables. Nothing sensitive is committed.
- **Cache files stay local.** `azure-foundry-models.json` is a runtime artifact generated from live ARM discovery. It is gitignored and never committed.
- **Cost data is public list pricing.** Per-token rates are sourced from Anthropic's published pricing and are estimates only. Actual Azure contract rates may differ.
- **Non-Claude models are statically defined.** Unlike Claude models (discovered dynamically via ARM API), DeepSeek/Kimi models in `azure-openai-models.ts` are defined in a static `MODELS` array. This is deliberate — these models use a different API path (OpenAI-compat vs Anthropic) and their deployment list is small and stable. To add a new non-Claude model, edit the `MODELS` array and re-sync.

## Extension Reload Semantics (read before debugging "my change didn't take")

Pi caches extension module factories **in memory, per process** (loader's `extensionCache`, keyed by resolved path). Consequences:

- A pi process started before an extension file changed keeps running the **old** code until the process exits. This conversation/debugging session included: edits synced at 22:23 were invisible to a pi started at 22:06.
- `/new`, `/resume`, `/fork` create new sessions in the **same process** — they do **not** re-import extension files. Only a full `pi` restart (quit + relaunch, per terminal tab) picks up extension changes.
- `pi list` lists installed extensions from settings; it does not tell you which code version a running process has loaded. Check `ps -o lstart -p <pid>` against the extension file's mtime instead.

**Verifying statusline/footer changes:**

- `PI_OFFLINE=1 pi --print --no-session "reply ok"` is a cheap load smoke test — extensions load at startup, so an import/syntax error surfaces before the model call.
- The footer render path needs a UI: `printf '/quit\r' | script -q /tmp/capture.txt pi --no-session` (feed it a few seconds first) renders the real footer in a PTY; grep the capture for tell-tale strings.
- `osascript -e 'tell application "Terminal" ... contents of tab'` reads another tab's visible screen — useful to check what a *different* running session actually displays.
- A **fresh** session renders almost no new markers: the token breakdown (`↑ ↓ R W`) and `CH%` are non-zero-only (matching pi's footer) and cost is `$0.00`. The fresh-session tell-tale is `0.0%/1.0M (auto)` (new) vs `0% (0k)` (old). Send one message before judging the display.

## Known Drift & Decisions

Documented deliberately rather than left as tribal knowledge. Revisit when pi upgrades or requirements change.

### statusline.ts crashed feynman: unguarded `pi.getSettings()` (fixed 2026-10-21)

`statusline.ts` called `pi.getSettings().compaction?.enabled` unguarded. `getSettings()` exists on the ExtensionAPI only in pi-coding-agent >= 1.x; feynman 0.3.48 bundles exactly 0.84.2 (its only published version), which lacks it. Because the call sat inside `render()` — invoked from pi-tui's render timer callback — the TypeError became an uncaughtException and killed the whole process (`feynman exiting due to uncaughtException`).

**Fixed:** the call is now guarded (`typeof pi.getSettings === "function"`), falling back to the ` (auto)` default (pi's default: compaction enabled) when settings are unavailable. Regression coverage in `statusline.test.mjs` (5 cases: getSettings absent + four compaction variants); it resolves `@earendil-works/pi-tui` via `statusline-test-hook.mjs`.

**Lesson:** extensions are developed against the global pi CLI (1.x) but run under feynman's bundled pi (0.84.x) — the two can differ by a major version. Any new `pi.<method>` call should be checked against the *bundled* `createExtensionAPI` in `<feynman app>/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js`, or guarded. This applies to any pi-bundling app, not just feynman.

### ~~MODEL_SPECS claude-sonnet-4-5 context window disagrees with pi's catalog~~ (RESOLVED 2026-10-20)

`MODEL_SPECS["claude-sonnet-4-5"]` in `azure-foundry.ts` declared `contextWindow: 1000000` while pi-ai's bundled `anthropic.json` catalog said `200000` for that model, and `azure-model-specs.test.mjs` failed on exactly this field.

**Resolved:** pinned to `200000` for catalog parity (Anthropic's standard Sonnet 4.5 context is 200k; 1M was a beta). If the Azure AI Foundry deployment is ever confirmed to serve a 1M-context variant, re-pin and add a documented test exception. All 75 parity checks now pass.

### azure-model-specs.test.mjs had silently broken (repaired 2026-10-20)

The MODEL_SPECS parity test had been failing to find the catalog at all — undetected across pi updates — for two reasons, both repaired in commit 9ad8ef3:

1. The `pi` binary moved from `dist/cli.js` to `dist/bundle/cli.js`, so its fixed `dirname(dirname(realpath))` package-root resolution landed one level short. Now walks up to the nearest `package.json`.
2. pi-ai's `anthropic.json` catalog keys are now namespaced `chat:<id>` (e.g. `chat:claude-haiku-4-5`); the test now tries both spellings.

Because the test was dead, MODEL_SPECS drift went undetected. Lesson: run `node pi/extensions/*.test.mjs` after every pi update, not only after editing extensions.

### Test pi-location resolution broke under the managed install (repaired 2026-10-21)

The pi 1.4.0 update migrated pi from an npm global install to the managed installer: `pi` is now a launcher script at `~/.pi/agent/bin/pi` that execs `~/.pi/agent/install/releases/<version>/node_modules/.bin/pi` (version named by `~/.pi/agent/install/current-version`). `which pi` therefore resolves to a script that is *not* inside any package, and the walk-up-to-nearest-`package.json` loop reached `/` and spun forever (`dirname("/") === "/")` — `azure-model-specs.test.mjs` and `session-stats.test.mjs` hung instead of failing. Same root cause in `statusline-test-hook.mjs`'s pi-tui resolution.

**Resolved:** new shared helper `pi-pkg-resolve.mjs` (`piPackageDir(pkg)`) — tries the managed layout first (via `current-version`), then the legacy npm walk-up with a root guard; returns the package dir for any `@earendil-works/*` package of the active install. Used by all three resolution sites. All 108 checks + 5 statusline cases pass again.

**Lesson:** the breakage came from the *install layout* changing, not the extension API — reinforces running the test suite after every pi update, including installer migrations.

### Valar has no retry coverage

`settings.json` sets `"retry": {"enabled": false}` globally — correct for the Azure providers, which retry in-extension via `lib/transient-retry.ts` so failed attempts stay out of the chat UI. But `pi/models.json` also defines a `valar` provider with no in-extension retry, so it gets zero retry on anything. All of pi's recent retry improvements (OpenAI Responses early-stream, DNS failures, summarization retry) are switched off for it.

**Decision:** accept the tradeoff. Re-enabling pi's retry globally would stack retries on the Azure providers (which already retry in-extension), producing duplicate attempts and multiple error lines in the TUI. Stripping the in-extension loops to migrate to pi's retry would lose the clean single-error UI. Valar is now the default provider, so this tradeoff is due for review: it still has no retry coverage.

### azure-openai-models.ts does not inherit tool-call-ID hardening

Pi 0.81+ fixed OpenAI-compat cross-provider replay to keep tool call IDs unique (#6854) in pi-ai's `convertMessages`/`normalizeToolCallId`. Our extension has its own `convertMessages` and passes `tc.id` through verbatim. We are permanently opted out of that code path and will not inherit future fixes to it. Practical risk is low (Azure MaaS emits unique plain IDs; our converter drops thinking blocks on replay). No action required — revisit if non-Azure models are ever routed through this provider.

### Azure extensions do not inherit per-request fetch injection

Pi 0.83+ added inherited per-request fetch injection for supported text and image provider transports. Both Azure extensions call `fetch()` directly inside `streamSimple` (via `lib/transient-retry.ts`), bypassing pi-ai's built-in transports. We are permanently opted out of any transport-level features pi builds on top of fetch injection (custom retry, proxy support, telemetry, etc.). The extensions already provide their own retry and auth, so the practical gap is narrow. Revisit if pi adds significant transport-level capabilities via fetch injection.

### Repo/live settings drift

`install.sh` syncs `pi/settings.json` to `~/.pi/agent/settings.json`, and `--force` overwrites any live changes, so change the default provider or model in the repo. Without `--force`, a difference gets the usual interactive choice.