/**
 * Valar provider — dynamic model discovery with local metadata enrichment.
 *
 * At startup, fetches the live model list from the Valar /v1/models endpoint
 * so newly added models (e.g. Kimi K3) appear automatically without editing
 * models.json. Known models are enriched with hand-maintained metadata
 * (reasoning, cost, maxTokens, display name); unknown models get sensible
 * defaults. If the fetch fails (network error, API down), falls back to the
 * static list embedded below so pi always has a working model set.
 *
 * The provider-level `compat` block matches the one previously in models.json:
 * supportsDeveloperRole + supportsReasoningEffort + max_completion_tokens.
 *
 * After enabling, you can remove the `valar` block from ~/.pi/agent/models.json
 * to avoid duplicate registration. Reload with /reload.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const VALAR_BASE_URL = "https://api.valarhq.ai/v1";
const FETCH_TIMEOUT_MS = 10_000;

interface ValarModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/**
 * Full model definitions used as a fallback when the live API is unreachable,
 * AND as the source of enrichment metadata for known model ids. Maintaining
 * an entry here gives a model its real cost/reasoning/maxTokens data; models
 * absent from this list still appear via the live API with defaults.
 *
 * Costs are the "Now" completion-window rates (USD per 1M tokens) from
 * https://docs.valarhq.ai/pricing, last synced 2026-08-12. Priority/Standard/
 * Flex windows are ~25%/50%/65% cheaper, so cost display assumes worst case.
 * Rates for models missing from the pricing page (Kimi-K3-fast, Kimi-K2.7,
 * Qwen3.5-27B) were reverse-engineered from actual spend via
 * /v1/usage/breakdown on 2026-08-12; see inline comments per model.
 */
const KNOWN_MODELS: ValarModel[] = [
  {
    id: "deepseek-ai/DeepSeek-V4-Pro",
    name: "DeepSeek V4 Pro",
    reasoning: true,
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 65536,
    cost: { input: 1.131, output: 2.262, cacheRead: 0.094, cacheWrite: 0 },
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Flash",
    name: "DeepSeek V4 Flash",
    reasoning: true,
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 65536,
    cost: { input: 0.09, output: 0.19, cacheRead: 0.03, cacheWrite: 0 },
  },
  {
    id: "moonshotai/Kimi-K2.7",
    name: "Kimi K2.7",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262144,
    maxTokens: 65536,
    // Not on the pricing page; rates backed out from /v1/usage/breakdown
    // (2026-08-12) — matches the published kimi-k2.7-code rates exactly.
    cost: { input: 0.75, output: 3.5, cacheRead: 0.15, cacheWrite: 0 },
  },
  {
    id: "moonshotai/Kimi-K3",
    name: "Kimi K3",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 65536,
    // "Now" window rates from https://docs.valarhq.ai/pricing (2026-08-12).
    cost: { input: 2.25, output: 11.25, cacheRead: 0.225, cacheWrite: 0 },
  },
  {
    id: "moonshotai/Kimi-K3-fast",
    name: "Kimi K3 Fast",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 65536,
    // Not on the pricing page; rates backed out from /v1/usage/breakdown
    // (2026-08-12) — exactly 1.5x Kimi-K3, matching Moonshot's official
    // K3-fast premium ($4.5/$15 official vs Valar's $2.25/$11.25).
    cost: { input: 3.375, output: 16.875, cacheRead: 0.3375, cacheWrite: 0 },
  },
  {
    id: "zai-org/GLM-5.2",
    name: "GLM 5.2",
    reasoning: true,
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 65536,
    cost: { input: 0.98, output: 3.4, cacheRead: 0.112, cacheWrite: 0 },
  },
  {
    id: "zai-org/GLM-5.2-fast",
    name: "GLM 5.2 Fast",
    reasoning: true,
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 65536,
    cost: { input: 1.68, output: 5.28, cacheRead: 0.168, cacheWrite: 0 },
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    reasoning: true,
    input: ["text"],
    contextWindow: 131072,
    maxTokens: 65536,
    cost: { input: 0.06, output: 0.4, cacheRead: 0.03, cacheWrite: 0 },
  },
  {
    id: "Qwen/Qwen3.5-397B-A17B",
    name: "Qwen 3.5 397B",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262144,
    maxTokens: 65536,
    cost: { input: 0.45, output: 1.35, cacheRead: 0.09, cacheWrite: 0 },
  },
  {
    id: "google/gemma-4-31B-it",
    name: "Gemma 4 31B IT",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262144,
    maxTokens: 16384,
    cost: { input: 0.36, output: 0.6, cacheRead: 0.2, cacheWrite: 0 },
  },
  {
    id: "MiniMaxAI/MiniMax-M2.7",
    name: "MiniMax M2.7",
    reasoning: true,
    input: ["text"],
    contextWindow: 204800,
    maxTokens: 65536,
    cost: { input: 0.27, output: 1.08, cacheRead: 0.054, cacheWrite: 0 },
  },
  {
    id: "MiniMaxAI/MiniMax-M3",
    name: "MiniMax M3",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 65536,
    cost: { input: 0.2, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
  },
  {
    id: "google/gemma-4-26B-A4B-it",
    name: "Gemma 4 26B A4B IT",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262144,
    maxTokens: 16384,
    cost: { input: 0.09, output: 0.27, cacheRead: 0.018, cacheWrite: 0 },
  },
  {
    id: "Qwen/Qwen3.5-27B",
    name: "Qwen 3.5 27B",
    reasoning: true,
    input: ["text"],
    contextWindow: 262144,
    maxTokens: 65536,
    // Input/output backed out from /v1/usage/breakdown (2026-08-12).
    // cacheRead estimated at 20% of input (Valar's Qwen-family pattern);
    // no cached-token usage existed to measure it directly.
    cost: { input: 0.27, output: 2.16, cacheRead: 0.054, cacheWrite: 0 },
  },
  {
    id: "Qwen/Qwen3.6-35B-A3B",
    name: "Qwen 3.6 35B A3B",
    reasoning: true,
    input: ["text"],
    contextWindow: 262144,
    maxTokens: 65536,
    cost: { input: 0.225, output: 0.9, cacheRead: 0.045, cacheWrite: 0 },
  },
  {
    id: "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-NVFP4",
    name: "Nemotron 3 Ultra 550B",
    reasoning: true,
    input: ["text"],
    contextWindow: 1048576,
    maxTokens: 65536,
    cost: { input: 0.5, output: 2.2, cacheRead: 0.1, cacheWrite: 0 },
  },
];

const KNOWN_BY_ID = new Map<string, ValarModel>(KNOWN_MODELS.map((m) => [m.id, m]));

interface ValarApiModel {
  id: string;
  name?: string;
  context_length?: number;
  supports_image_input?: boolean;
  supports_tools?: boolean;
}

interface ValarApiPayload {
  data?: ValarApiModel[];
}

function enrich(apiModel: ValarApiModel): ValarModel {
  const known = KNOWN_BY_ID.get(apiModel.id);
  return {
    id: apiModel.id,
    name: known?.name ?? apiModel.name ?? apiModel.id,
    // Every Valar model currently supports reasoning; default true so unknown
    // models don't silently lose extended thinking.
    reasoning: known?.reasoning ?? true,
    input:
      known?.input ??
      (apiModel.supports_image_input ? ["text", "image"] : ["text"]),
    contextWindow: apiModel.context_length ?? known?.contextWindow ?? 128000,
    // Valar /v1/models does not expose max output tokens; default to 65536.
    maxTokens: known?.maxTokens ?? 65536,
    cost: known?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

async function fetchLiveModels(): Promise<ValarModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const apiKey = process.env.VALAR_API_KEY ?? "";
    const response = await fetch(`${VALAR_BASE_URL}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Valar /models returned ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as ValarApiPayload;
    const data = payload.data ?? [];
    if (data.length === 0) {
      throw new Error("Valar /models returned an empty model list");
    }
    return data.map(enrich);
  } finally {
    clearTimeout(timeout);
  }
}

export default async function (pi: ExtensionAPI) {
  let models: ValarModel[];
  try {
    models = await fetchLiveModels();
  } catch (error) {
    // Keep pi usable if Valar is unreachable at startup.
    console.warn(
      `[valar-dynamic] live fetch failed (${error instanceof Error ? error.message : String(error)}); using static fallback list (${KNOWN_MODELS.length} models)`,
    );
    models = KNOWN_MODELS;
  }

  pi.registerProvider("valar", {
    baseUrl: VALAR_BASE_URL,
    apiKey: "$VALAR_API_KEY",
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: true,
      supportsReasoningEffort: true,
      maxTokensField: "max_completion_tokens",
    },
    models,
  });
}