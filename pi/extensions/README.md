# Pi Extensions

Extensions for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent) — auto-discovered from `~/.pi/agent/extensions/` and synced against this directory in both directions by `install.sh`.

## Extensions

### `lib/azure-token.ts`
Shared Entra ID token acquisition utility used by both Azure extensions. Caches tokens per resource with automatic refresh. Not a standalone provider — imported by the other extensions. Lives under `lib/` on purpose: pi auto-loads **every top-level file** in `extensions/` as an extension (each must export a default factory), so shared helpers must sit in a subdirectory. A subdir without an `index.ts` or a pi-manifest `package.json` is ignored by pi's loader but stays importable (e.g. `from "./lib/azure-token"`).

### `statusline.ts`
Two-line footer (`ui.setFooter`). Line one: model, directory, git branch + diff stats, thinking level. Line two: context-usage bar with percent/tokens, session cost, elapsed session time.

The timer counts wall-clock time since pi attached to the session, so every `session_start` restarts it — `/new`, `/resume`, `/fork`, and extension reload all read `0m 00s` again, and time with pi closed never counts. Cost sums `usage.cost.total` over the same entry kinds pi's built-in footer counts (assistant messages, tool results, `usage`, compaction, branch summaries) and prints three decimals, so a sub-cent session stays visible.

pi only redraws on events, so the footer component owns a 1 Hz `tui.requestRender()` tick; it is `unref()`'d and cleared both by its own `dispose` and on `session_shutdown`, because pi's teardown disposes the built-in footer but not a custom one. Provider rate-limit usage from the Claude Code version is still not ported — the API does not expose it.

Test with `node statusline.test.mts`.

### `model-router.ts`
Picks the model for a session from its first prompt. Ports Claude Code's `model-router.sh` + `model-router-lib.sh`, with the one switch that harness couldn't do: `pi.setModel()` applies the routed model for the rest of the session.

A multimodal prompt — attached images, or a `.pdf` filename in the prompt text — switches to the `multimodal` model and skips the classifier. Jev reads a redacted text copy, so it cannot weigh visual content, and Pi has no PDF attachment channel: a PDF reaches a prompt only as a path or filename. Everything else goes to TypeSafe's Jev, which returns `simple` / `standard` / `complex`, and the router switches to `tiers[tier]`.

Routing happens once per session. A target must resolve inside the session's scoped models (`enabledModels` in `settings.json`) or the router warns and keeps the current model; every failure path — missing key, network error, malformed response, unroutable tier — fails open. The Jev path requires `TYPESAFE_API_KEY`; the multimodal path does not. Same redacted-prompt-to-a-third-party tradeoff as the Claude Code version — see the file header for the sanitization details.

Config lives in `model-router.json` one directory above this one — `pi/model-router.json` in the repo, `~/.pi/agent/model-router.json` when live: `enabled`, `tiers`, and `multimodal` (default `azure-claude/claude-opus-5`). Test with `node model-router.test.mts`.

### `azure-foundry.ts`
Anthropic-compatible provider for Claude models deployed through Azure AI Foundry. Discovers models dynamically via ARM API at startup; falls back to a local cache when ARM is unreachable.

**Requires these environment variables:**
- `AZURE_FOUNDRY_BASE_URL` — Anthropic API endpoint
- `AZURE_FOUNDRY_ARM_SUBSCRIPTION` — Azure subscription GUID
- `AZURE_FOUNDRY_ARM_RESOURCE_GROUP` — Azure resource group name
- `AZURE_FOUNDRY_ARM_ACCOUNT` — Azure Cognitive Services account name

Auth uses Entra ID via `az cli`.

Model specs (`MODEL_SPECS`) are sourced from pi-ai's bundled `anthropic.json` catalog — context window, max tokens, reasoning flag, cost, `thinkingLevelMap`, and adaptive-thinking mode all match the catalog entry for each model. A regression test (`azure-model-specs.test.mjs`) asserts field-by-field parity to prevent drift. Unknown Claude deployments emit a console warning instead of silently degrading to defaults.

### `azure-openai-models.ts`
OpenAI-compatible provider for non-Claude models (DeepSeek, Kimi, etc.) deployed as serverless MaaS on Azure AI Foundry.

**Requires these environment variables:**
- `AZURE_FOUNDRY_OPENAI_BASE_URL` — OpenAI-compat API endpoint
- `AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID` — Deployment ID for DeepSeek model
- `AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID` — Deployment ID for Kimi model

Auth uses Entra ID via `az cli`. Models are defined statically — add new deployments by editing the `MODELS` array in the source. Kimi's `thinkingLevelMap` uses explicit `null` values for unsupported levels (minimal, xhigh, max) so pi's UI only offers the levels Kimi actually supports. `reasoning_effort` is read from `options.reasoning` (the `SimpleStreamOptions` field), not the internal `reasoningEffort` field that pi-ai's wrapper computes.

### `lifecycle-guards/`
Lifecycle guards extension that ports the Claude Code bash hooks to Pi's extension event system. Provides the same deterministic rules in both runtimes:

- **Session context** (`before_agent_start`) — injects workflow reminder at session start.
- **Protected paths** (`tool_call: write/edit`) — blocks edits to `.env`, `.git/`, `generated/`, and paths outside the project root.
- **Command policy** (`tool_call: bash`) — blocks destructive shell commands (`rm -rf /`, `DROP TABLE`, `cat .env`, force-push to main/master).
- **Memory compression** (`tool_result: write`) — compresses prose in `memory/*.md` files (removes filler words, replaces verbose phrases, preserves code/URLs/headings/frontmatter).
- **Design antipattern check** (`tool_result: write/edit`) — detects AI-tell patterns in frontend files (pure black/white, HSL, purple gradients, Inter/Roboto fonts, side-stripe borders, gradient text). Tracks each failing file independently (fixing one file never masks another) and mirrors state to `.hook-state/last_design_gate.json` for observability.
- **Completion gate** (`agent_end`) — queues a follow-up message while any frontend file still fails, with a circuit breaker (max 3 follow-ups) that re-arms when the failing set changes. State is in-memory, so it is scoped to the current session and can never carry a stale block into a fresh one.
- **Audit record** (`session_shutdown`) — appends a JSONL line to `reports/session-audit.log`.

**State files** (per-project, gitignored):
- `.hook-state/last_design_gate.json`
- `reports/session-audit.log`

**Interaction with plan-mode:** Both extensions listen to `tool_call`. Plan-mode returns early when not in plan mode. When plan mode is active, both handlers run — if either blocks, the tool is blocked. The command policy here is a subset of plan-mode's restrictions, so plan-mode's stricter checks block first.

**Tests:** `node lifecycle-guards/lifecycle-guards.test.mjs` (56 unit tests for pure logic in `utils.ts`). The Claude Code side has a matching behavioral harness: `bash hooks/hooks.test.sh` from the repo, or `bash ~/.claude/hooks/hooks.test.sh` (68 assertions). Run that one as `env -u TYPESAFE_API_KEY bash hooks.test.sh`: the "no TYPESAFE_API_KEY → fail open" assertion doesn't scrub the inherited environment, so an exported key fails that check.

### Test files

Every extension test lives next to the code it covers. Counts re-verified 2026-09-30 on Node v24.21.0: 224 checks in six suites. Five suites (149 checks) pass; `azure-model-specs.test.mjs` aborts on its first assertion because pi 0.99.1's bundled `anthropic.json` no longer lists `claude-haiku-4-5`, so `MODEL_SPECS` names a model the catalog dropped. That is catalog drift against a newer pi, unrelated to the statusline work, and still open. Each suite runs with `node <file>` from `~/.pi/agent/extensions` or from `pi/extensions` in the repo — both work, since the suites use relative imports. Native TypeScript type stripping needs Node >= 23.6 (`--experimental-strip-types` on 22.6–23.5). The azure and lifecycle-guards suites register `ts-resolve-hook.mjs`, which appends `.ts` to extensionless relative imports — pi's bundler resolves those, Node's loader doesn't.

| File | Checks | What it guards |
|---|---|---|
| `lifecycle-guards/lifecycle-guards.test.mjs` | 56 | Pure logic for every guard rule: protected paths, command policy, design antipatterns, memory compression, file classification, `SESSION_CONTEXT`. |
| `azure-model-specs.test.mjs` | 75 | `MODEL_SPECS` ↔ pi-ai `anthropic.json` parity: contextWindow, maxTokens, reasoning, cost, `forceAdaptiveThinking`, thinkingLevelMap. Locates the catalog by walking up from `which pi` to pi's agent dir and reading `install/current-version`. |
| `azure-stream-result.test.mjs` | 23 | Azure stream-result normalization: `finish_reason` mapping, delta handling, retry loop. |
| `azure-reasoning-effort.test.mjs` | 10 | `reasoning_effort` payload mapping per model. |
| `model-router.test.mts` | 27 | Multimodal detection (attached images, `.pdf` tokens), config normalization, model-ref resolution, routing decisions. Drives the real extension factory and the real `model-router.json`; only the Jev fetch is stubbed. |
| `statusline.test.mts` | 33 | Elapsed-time and cost formatters, the entry kinds that count toward session cost, and the footer itself — two-line render, tick-per-second advancement, ticker cleanup on `dispose` and `session_shutdown`, timer reset on a later `session_start`. Drives the real extension factory with a faked clock and faked interval timers; the git branch line runs against a real temp repo through a real `execFile`. |

### `plan-mode/`
Read-only exploration mode with plan tracking, step completion, and post-compaction auto-resume. See `plan-mode/README.md` for full details.

### `zz-auto-continue/`
Queues a continuation message after non-retrying compaction so the agent keeps going without manual "continue." Circuit breaker: max 5 auto-continues per user-initiated run.

**Interaction with plan-mode on compaction:** The `zz-` prefix ensures this extension loads after `plan-mode` (extensions load in directory-name order). In plan-mode *execution* sessions, both extensions queue a continuation on `session_compact`. The `hasPendingMessages()` guard in zz-auto-continue does NOT detect plan-mode's queued message because plan-mode uses `pi.sendMessage()` (custom-message path) which does not increment `pendingMessageCount`. This double-queue is harmless — both messages are "continue" variants, the agent processes them in order, and both extensions have circuit breakers. The guard is kept as a best-effort skip for extensions that use `pi.sendUserMessage()` (which does increment `pendingMessageCount`).

### Not vendored
Three files live in `~/.pi/agent/extensions/` on purpose and are gitignored, so `install.sh` never offers to copy them up:

| File | Why it stays local |
|---|---|
| `azure-foundry-models.json` | Runtime cache from live ARM discovery. Rewrites `lastUpdated` on every start, so tracking it would report drift forever and could ship a machine-specific model set. |
| `valar-dynamic.ts` | Personal provider shim for the Valar proxy, including reverse-engineered per-model pricing. Only meaningful with a Valar API key; replaces the older `valar-strip-reasoning.ts` shim. |
| `herdr-agent-state.ts` | Written and overwritten by the Herdr integration (`HERDR_INTEGRATION_VERSION=8`). Its own header says to add custom hooks beside it rather than edit it. |

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

# 3. Optional: model routing (needed only by model-router.ts)
export TYPESAFE_API_KEY="your-typesafe-key"

# 4. Log in to Azure CLI
az login
```

Three more things `install.sh` does not do for you:

- **Pi packages.** `settings.json` declares them under `packages`. Install each one with `pi install npm:<name>` — pi writes the declaration to `~/.pi/agent/settings.json` — or run `pi update --extensions` to reconcile ones already declared.
- **Upstream skills.** The Matt Pocock engineering skills are not vendored. Fetch them from upstream into `~/.pi/agent/skills/`; the list of 22 is in the repo's `.gitignore` under the `# Pi skills — Matt Pocock upstream` block.
- **Personal files.** Anything marked local-only above stays absent until you recreate it. `theme` and `defaultModel` in `settings.json` are yours to set; see the drift guard below before you let a repo copy overwrite them.

Prefer `./install.sh` over `./install.sh --force`. `--force` answers every "differs" prompt with `repo` without showing you the choice, which is how live settings got clobbered twice.

## Design Notes

- **No Azure identifiers in version control.** All subscription IDs, resource group names, account names, and endpoint URLs are configured via environment variables. Nothing sensitive is committed.
- **No credentials anywhere in the tree.** Extensions read keys from the environment (`TYPESAFE_API_KEY`, Azure/Entra via `az cli`). `~/.pi/agent/auth.json`, `trust.json`, and `models-store.json` are machine state and are never synced.
- **Cache files stay local.** `azure-foundry-models.json` is a runtime artifact generated from live ARM discovery. It is gitignored and never committed.
- **Test files sync too.** The extension glob covers `.ts`, `.mts`, `.mjs`, `.md`, and `.json`, so the six test suites stay in step with the code they cover. Before the `.mjs`/`.mts` patterns landed on 2026-09-25 they were hand-copied, and two — `azure-model-specs.test.mjs` and `lifecycle-guards/lifecycle-guards.test.mjs` — were carrying live fixes that never reached the repo.
- **`settings.json` is tracked with a drift guard.** `retry` is protected and `lastChangelogVersion` is ignored when comparing — see "Repo/live settings drift" below.
- **Cost data is public list pricing.** Per-token rates are sourced from Anthropic's published pricing and are estimates only. Actual Azure contract rates may differ.
- **Non-Claude models are statically defined.** Unlike Claude models (discovered dynamically via ARM API), DeepSeek/Kimi models in `azure-openai-models.ts` are defined in a static `MODELS` array. This is deliberate — these models use a different API path (OpenAI-compat vs Anthropic) and their deployment list is small and stable. To add a new non-Claude model, edit the `MODELS` array and re-sync.

## Known Drift & Decisions

Documented deliberately rather than left as tribal knowledge. Revisit when pi upgrades or requirements change.

### my-agent-config is the pi config source again (2026-09-25)

This section previously recorded the repo as deprecated, with an instruction not to run its `install.sh`. That decision is reversed. `my-agent-config` is once again the canonical source for pi configuration: `pi/extensions/`, `pi/skills/`, `pi/AGENTS.md`, `pi/settings.json`, `pi/models.json`, and `pi/model-router.json`. `install.sh` syncs all of them against `~/.pi/agent/` in both directions.

Why: the repo is shared with the team and is the only place a new machine or a teammate can be re-provisioned from. `~/.pi/agent/skills` had grown to 60 skill directories with no version control at all, the extension tree had live fixes nothing ever copied back, and `~/.pi/agent/AGENTS.md` — which carries every rule pi applies — was tracked nowhere.

What changed to make the revival safe: the guard in "Repo/live settings drift" plus the explicit `# Pi skills — Matt Pocock upstream` ignore block. The original problem was whole-file clobbering of live settings, which now stops at protected keys and prompts instead of overwriting.

The deprecation entry from 2026-08-20 (amended 2026-09-24 to correct a wrong "deleted" claim) described an August snapshot as deployed by nothing. That was accurate then. It is not now.

**Security, still open:** `.git/config` embeds a GitHub personal access token in the `origin` remote URL, and the same token string appears in two transcripts under `~/.claude/projects/`. The token grants push access to `arvindbattula/my-agent-config`. Rotate it and move the remote to a credential helper or SSH. It appears in no tracked file.

`~/.claude/hooks/protect-paths.sh` allows writes under `$HOME/my-agent-config/*`, which this decision keeps load-bearing.

### Valar retry

`settings.json` sets `"retry": {"enabled": true, "maxRetries": 3, "baseDelayMs": 2000}`. Retry must stay **enabled** — with it off, transient blips to api.valarhq.ai surface as "Error: Connection error." Diagnosed 2026-08-15; regressed twice through my-agent-config syncs, which is why the key is protected now.

Supersedes the earlier "Valar has no retry coverage" tradeoff, which accepted `retry: {"enabled": false}` because the Azure providers retry in-extension via `lib/transient-retry.ts` and a global retry would stack on top of them, producing duplicate attempts and extra error lines in the TUI. That reasoning still holds for Azure; it lost to Valar being the daily-use provider. Superseded 2026-08-15.

### Azure Opus 5 thinking levels

`MODEL_SPECS["claude-opus-5"].thinkingLevelMap` was missing `off: null`, so pi offered the `off` thinking level for `azure-claude/claude-opus-5` even though pi-ai's bundled catalog marks thinking non-disableable on that model (pi-ai: "null marks a level as unsupported", absent keys fall back to provider defaults). Synced with the 0.87.1 catalog on 2026-09-24 — `off` no longer shows up in `/thinking` for opus-5. `azure-model-specs.test.mjs` catches the next instance of this drift.

### azure-openai-models.ts does not inherit tool-call-ID hardening

Pi 0.81+ fixed OpenAI-compat cross-provider replay to keep tool call IDs unique (#6854) in pi-ai's `convertMessages`/`normalizeToolCallId`. Our extension has its own `convertMessages` and passes `tc.id` through verbatim. We are permanently opted out of that code path and will not inherit future fixes to it. Practical risk is low (Azure MaaS emits unique plain IDs; our converter drops thinking blocks on replay). No action required — revisit if non-Azure models are ever routed through this provider.

### Azure extensions do not inherit per-request fetch injection

Pi 0.83+ added inherited per-request fetch injection for supported text and image provider transports. Both Azure extensions call `fetch()` directly inside `streamSimple` (via `lib/transient-retry.ts`), bypassing pi-ai's built-in transports. We are permanently opted out of any transport-level features pi builds on top of fetch injection (custom retry, proxy support, telemetry, etc.). The extensions already provide their own retry and auth, so the practical gap is narrow. Revisit if pi adds significant transport-level capabilities via fetch injection.

### Repo/live settings drift

`pi/settings.json` is now committed from live, so it reflects current usage: Valar as the default provider, `moonshotai/Kimi-K3` as the default model, four packages, and an `enabledModels` scope. Two keys still drift on their own:

- `lastChangelogVersion` — pi rewrites it on every upgrade. `install.sh` drops it before comparing, so it never reports a difference.
- `retry` — protected. A repo → local copy that would change it is refused unless you explicitly override after seeing both values, and `--force` cannot bypass that.

`theme` and `defaultModel` are personal and do drift between machines. Answer the prompt with `l` to keep the live values, or commit the repo copy if your preference should be the new team default.
