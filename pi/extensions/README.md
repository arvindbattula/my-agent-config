# Pi Extensions

Extensions for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent) — auto-discovered from `~/.pi/agent/extensions/` (synced by `install.sh`).

## Extensions

### `lib/azure-token.ts`
Shared Entra ID token acquisition utility used by both Azure extensions. Caches tokens per resource with automatic refresh. Not a standalone provider — imported by the other extensions. Lives under `lib/` on purpose: pi auto-loads **every top-level file** in `extensions/` as an extension (each must export a default factory), so shared helpers must sit in a subdirectory. A subdir without an `index.ts` or a pi-manifest `package.json` is ignored by pi's loader but stays importable (e.g. `from "./lib/azure-token"`).

### `statusline.ts`
Two-line status bar footer showing model, directory, git branch + diff stats, thinking level, context usage, tokens, cost, and session elapsed time.

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

**Tests:** `node pi/extensions/lifecycle-guards/lifecycle-guards.test.mjs` (56 unit tests for pure logic in `utils.ts`). The Claude Code side has a matching behavioral harness: `bash hooks/hooks.test.sh` (35 assertions across all five hooks, including command-policy parity, per-file gate tracking, and cross-session staleness).

### Test files

| File | Checks | What it guards |
|---|---|---|
| `azure-stream-result.test.mjs` | 14 | `result()` contract without iteration; retry loop on transient HTTP; abort-aware backoff |
| `lifecycle-guards/lifecycle-guards.test.mjs` | 56 | Pure-logic unit tests for all guard rules |
| `azure-model-specs.test.mjs` | 75 | `MODEL_SPECS` parity with pi-ai's bundled `anthropic.json` (context, maxTokens, reasoning, cost, thinkingLevelMap, adaptive) |
| `azure-reasoning-effort.test.mjs` | 10 | `reasoning_effort` sent from `options.reasoning` with clamping; `off`/undefined omitted; non-reasoning model excluded |

### `plan-mode/`
Read-only exploration mode with plan tracking, step completion, and post-compaction auto-resume. See `plan-mode/README.md` for full details.

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

## Design Notes

- **No Azure identifiers in version control.** All subscription IDs, resource group names, account names, and endpoint URLs are configured via environment variables. Nothing sensitive is committed.
- **Cache files stay local.** `azure-foundry-models.json` is a runtime artifact generated from live ARM discovery. It is gitignored and never committed.
- **Cost data is public list pricing.** Per-token rates are sourced from Anthropic's published pricing and are estimates only. Actual Azure contract rates may differ.
- **Non-Claude models are statically defined.** Unlike Claude models (discovered dynamically via ARM API), DeepSeek/Kimi models in `azure-openai-models.ts` are defined in a static `MODELS` array. This is deliberate — these models use a different API path (OpenAI-compat vs Anthropic) and their deployment list is small and stable. To add a new non-Claude model, edit the `MODELS` array and re-sync.