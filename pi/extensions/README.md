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

### `azure-openai-models.ts`
OpenAI-compatible provider for non-Claude models (DeepSeek, Kimi, etc.) deployed as serverless MaaS on Azure AI Foundry.

**Requires these environment variables:**
- `AZURE_FOUNDRY_OPENAI_BASE_URL` — OpenAI-compat API endpoint
- `AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID` — Deployment ID for DeepSeek model
- `AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID` — Deployment ID for Kimi model

Auth uses Entra ID via `az cli`. Models are defined statically — add new deployments by editing the `MODELS` array in the source.

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