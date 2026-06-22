// Azure AI Foundry provider extension (Entra ID auth)
// Models are discovered dynamically from the ARM API at startup and persisted
// to a local cache. Additions and removals in the Foundry portal are picked up
// automatically. If ARM is unreachable the last-known-good cache is used with
// a console warning.
//
// Configuration — set these env vars before launch:
//   AZURE_FOUNDRY_BASE_URL           Anthropic API endpoint (e.g. https://<account>.services.ai.azure.com/anthropic/v1)
//   AZURE_FOUNDRY_ARM_SUBSCRIPTION   Azure subscription GUID
//   AZURE_FOUNDRY_ARM_RESOURCE_GROUP Azure resource group name
//   AZURE_FOUNDRY_ARM_ACCOUNT        Azure Cognitive Services account name

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { getAzureToken } from "./lib/azure-token";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const BASE_URL = requireEnv("AZURE_FOUNDRY_BASE_URL");
const ANTHROPIC_VERSION = "2023-06-01";

const ARM_SUBSCRIPTION = requireEnv("AZURE_FOUNDRY_ARM_SUBSCRIPTION");
const ARM_RESOURCE_GROUP = requireEnv("AZURE_FOUNDRY_ARM_RESOURCE_GROUP");
const ARM_ACCOUNT = requireEnv("AZURE_FOUNDRY_ARM_ACCOUNT");

const CACHE_PATH = `${homedir()}/.pi/agent/extensions/azure-foundry-models.json`;

const COGNITIVE_SERVICES_RESOURCE = "https://cognitiveservices.azure.com";
const MANAGEMENT_RESOURCE = "https://management.azure.com";

function getInferenceToken(): string {
  return getAzureToken(COGNITIVE_SERVICES_RESOURCE);
}

function getArmToken(): string {
  return getAzureToken(MANAGEMENT_RESOURCE);
}

// Anthropic published specs — Azure doesn't expose these via API.
// Per-tier pricing in $/token. Source: Anthropic public list rates (cross-validated
// against the azure_ai/ channel in LiteLLM's model_prices_and_context_window.json,
// 2026-06). These are LIST rates, not Azure contract rates — cost shown is an
// estimate. Update if Anthropic changes published pricing.
//   Opus 4.5–4.8: $5 / $25 / $0.50 / $6.25 (in/out/cacheRead/cacheWrite per Mtok)
//   Sonnet 4.5–4.6: $3 / $15 / $0.30 / $3.75
//   Haiku 4.5:      $1 / $5  / $0.10 / $1.25
type Cost = { input: number; output: number; cacheRead: number; cacheWrite: number };
const perM = (i: number, o: number, cr: number, cw: number): Cost => ({
  input: i / 1e6, output: o / 1e6, cacheRead: cr / 1e6, cacheWrite: cw / 1e6,
});
const OPUS_COST = perM(5, 25, 0.5, 6.25);
const SONNET_COST = perM(3, 15, 0.3, 3.75);
const HAIKU_COST = perM(1, 5, 0.1, 1.25);
const ZERO_COST: Cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// Keyed by the underlying model name returned in deployment.properties.model.name.
// Only needs updating when a genuinely new model family ships with different limits.
// `adaptive` mirrors pi-ai's compat.forceAdaptiveThinking: these models reject
// thinking.type="enabled" (budget-based) and require thinking.type="adaptive" with
// output_config.effort. `xhighEffort` is the effort name a model accepts for the
// pi "xhigh" level (from pi-ai's per-model thinkingLevelMap); other levels use the
// minimal/low→low, medium→medium, high→high fallback.
type Spec = {
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  cost: Cost;
  adaptive?: boolean;
  xhighEffort?: string;
};

const MODEL_SPECS: Record<string, Spec> = {
  "claude-haiku-4-5":  { contextWindow: 200000, maxTokens: 16384, reasoning: false, cost: HAIKU_COST  },
  "claude-sonnet-4-5": { contextWindow: 200000, maxTokens: 16384, reasoning: false, cost: SONNET_COST },
  "claude-sonnet-4-6": { contextWindow: 200000, maxTokens: 16384, reasoning: true,  cost: SONNET_COST, adaptive: true, xhighEffort: "xhigh" },
  "claude-opus-4-5":   { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST   },
  "claude-opus-4-6":   { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST,   adaptive: true, xhighEffort: "xhigh" },
  "claude-opus-4-7":   { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST,   adaptive: true, xhighEffort: "xhigh" },
  "claude-opus-4-8":   { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST,   adaptive: true, xhighEffort: "xhigh" },
  "claude-fable-5":    { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST,   adaptive: true, xhighEffort: "xhigh" },
};

const SPEC_DEFAULTS: Spec = { contextWindow: 200000, maxTokens: 16384, reasoning: false, cost: ZERO_COST };

// Resolve per-token rates for a deployment id by matching the underlying model
// name in MODEL_SPECS. Used so cost works even if a model came from a stale
// cache with zeroed rates.
function rateForModel(model: any): Cost {
  if (model?.cost && model.cost.input > 0) return model.cost;
  const id: string = model?.id ?? "";
  for (const [name, spec] of Object.entries(MODEL_SPECS)) {
    if (id.includes(name)) return spec.cost;
  }
  return ZERO_COST;
}

// Resolve thinking spec for a model. Prefers the fields built onto the model object,
// but falls back to a MODEL_SPECS lookup by id so models loaded from an older cache
// (built before these fields existed) still get the correct thinking mode.
function thinkingSpecForModel(model: any): { adaptive: boolean; xhighEffort?: string } {
  if (typeof model?.adaptiveThinking === "boolean") {
    return { adaptive: model.adaptiveThinking, xhighEffort: model.xhighEffort };
  }
  const id: string = model?.id ?? "";
  for (const [name, spec] of Object.entries(MODEL_SPECS)) {
    if (id.includes(name)) return { adaptive: spec.adaptive ?? false, xhighEffort: spec.xhighEffort };
  }
  return { adaptive: false };
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

interface CacheFile {
  lastUpdated: string;
  models: any[];
}

function loadCache(): CacheFile | null {
  try {
    const raw = readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

function saveCache(models: any[]): void {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    const payload: CacheFile = {
      lastUpdated: new Date().toISOString(),
      models,
    };
    writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err: any) {
    console.warn(`[azure-foundry] Could not write model cache: ${err.message}`);
  }
}

// ── Model discovery ───────────────────────────────────────────────────────────

function deploymentDisplayName(deploymentName: string): string {
  const match = deploymentName.match(/claude-(.+)$/i);
  if (!match) return `${deploymentName} (Azure)`;
  const parts = match[1].split("-");
  const family = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const version = parts.slice(1).join(".");
  return `Claude ${family} ${version} (Azure)`;
}

function buildModel(deploymentName: string, underlyingModelName: string): any {
  const spec = MODEL_SPECS[underlyingModelName] ?? SPEC_DEFAULTS;
  return {
    id: deploymentName,
    name: deploymentDisplayName(deploymentName),
    reasoning: spec.reasoning,
    input: ["text", "image"],
    contextWindow: spec.contextWindow,
    maxTokens: spec.maxTokens,
    cost: spec.cost,
    adaptiveThinking: spec.adaptive ?? false,
    xhighEffort: spec.xhighEffort,
  };
}

async function fetchLiveDeployments(): Promise<any[]> {
  const token = getArmToken();
  const url =
    `https://management.azure.com/subscriptions/${ARM_SUBSCRIPTION}` +
    `/resourceGroups/${ARM_RESOURCE_GROUP}` +
    `/providers/Microsoft.CognitiveServices/accounts/${ARM_ACCOUNT}` +
    `/deployments?api-version=2024-10-01`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ARM deployments list failed: HTTP ${res.status} — ${body}`);
  }

  const data: any = await res.json();
  const models: any[] = [];

  for (const dep of data.value ?? []) {
    if (dep.properties?.provisioningState !== "Succeeded") continue;
    const underlyingName: string = dep.properties?.model?.name ?? "";
    // Only register Claude models here — non-Claude models (DeepSeek, Kimi, etc.)
    // are handled by azure-openai-models.ts via the OpenAI-compat API.
    if (!underlyingName.startsWith("claude-")) continue;
    models.push(buildModel(dep.name, underlyingName));
  }

  return models;
}

// Diff live results against cache. Logs additions and removals.
function applyDiff(live: any[], cached: any[]): any[] {
  const liveIds = new Set(live.map((m) => m.id));
  const cachedIds = new Set(cached.map((m) => m.id));

  const added = live.filter((m) => !cachedIds.has(m.id));
  const removed = cached.filter((m) => !liveIds.has(m.id));

  for (const m of added) {
    console.log(`[azure-foundry] Added deployment: ${m.id} (${m.name})`);
  }
  for (const m of removed) {
    console.log(`[azure-foundry] Removed deployment: ${m.id} (${m.name})`);
  }

  // Live is always authoritative when ARM succeeds
  return live;
}

async function resolveModels(): Promise<any[]> {
  const cache = loadCache();

  let live: any[];
  try {
    live = await fetchLiveDeployments();
  } catch (err: any) {
    // ARM unreachable — fall back to cache with a warning
    if (cache) {
      console.warn(
        `[azure-foundry] ARM discovery failed (${err.message}). ` +
        `Using cached model list from ${cache.lastUpdated}.`
      );
      return cache.models;
    }
    console.error(`[azure-foundry] ARM discovery failed and no cache exists: ${err.message}`);
    return [];
  }

  if (live.length === 0) {
    console.warn("[azure-foundry] ARM returned 0 succeeded deployments — check subscription/RG access.");
  }

  const final = cache ? applyDiff(live, cache.models) : live;
  saveCache(final);
  return final;
}

// ── Extension entry point ─────────────────────────────────────────────────────

export default async function (pi: any) {
  const models = await resolveModels();

  pi.registerProvider("azure-claude", {
    api: "anthropic",
    baseUrl: BASE_URL,
    apiKey: "entra-id", // required by pi validation, not used for auth
    models,

    streamSimple: function (model: any, context: any, options: any) {
      let finalMessage: any = null;

      async function* generate() {
        const output: any = {
          role: "assistant",
          content: [],
          api: "anthropic",
          provider: "azure-claude",
          model: model.id,
          usage: {
            input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        };
        finalMessage = output;

        // Map pi messages to Anthropic API format
        const rawMapped: any[] = [];
        for (const m of context.messages ?? []) {
          if (m.role === "user") {
            const content =
              typeof m.content === "string"
                ? m.content
                : (m.content ?? [])
                    .filter((c: any) => c.type === "text" || c.type === "image")
                    .map((c: any) =>
                      c.type === "text" ? { type: "text", text: c.text } : c
                    );
            rawMapped.push({ role: "user", content });
          } else if (m.role === "assistant") {
            const content = (m.content ?? [])
              .map((c: any) => {
                if (c.type === "text") return { type: "text", text: c.text };
                if (c.type === "thinking") {
                  // Redacted thinking: pass the opaque payload back as redacted_thinking.
                  // Drop it if the data is missing/empty — Anthropic rejects a
                  // redacted_thinking block without a data payload.
                  if (c.redacted) {
                    if (!c.thinkingSignature || !String(c.thinkingSignature).trim()) return null;
                    return { type: "redacted_thinking", data: c.thinkingSignature };
                  }
                  if (!c.thinking || !c.thinking.trim()) return null;
                  // Anthropic requires a valid signature to replay a thinking block (notably
                  // for interleaved-thinking across tool-use turns). Without one (e.g. aborted
                  // stream), fall back to plain text rather than dropping the block. Tag the
                  // fallback so the ordering guard below can drop it if a signed thinking
                  // block exists in the same turn (Anthropic requires thinking to be first).
                  if (!c.thinkingSignature || !c.thinkingSignature.trim())
                    return { type: "text", text: c.thinking, __thinkingFallback: true };
                  return { type: "thinking", thinking: c.thinking, signature: c.thinkingSignature };
                }
                if (c.type === "toolCall")
                  return { type: "tool_use", id: c.id, name: c.name, input: c.arguments ?? {} };
                return null;
              })
              .filter(Boolean);
            // Ordering guard: when thinking is replayed, Anthropic requires the first block of
            // the assistant turn to be thinking/redacted_thinking. If a signatureless thinking
            // block was converted to text and a real thinking block also exists, drop the text
            // fallback so it can't precede (or split) the required first thinking block.
            const hasRealThinking = content.some(
              (c: any) => c.type === "thinking" || c.type === "redacted_thinking",
            );
            const ordered = (hasRealThinking
              ? content.filter((c: any) => !c.__thinkingFallback)
              : content
            ).map((c: any) => {
              if (c.__thinkingFallback) {
                const { __thinkingFallback, ...rest } = c;
                return rest;
              }
              return c;
            });
            if (ordered.length > 0) rawMapped.push({ role: "assistant", content: ordered });
          } else if (m.role === "toolResult") {
            let resultContent: any = String(m.content ?? "");
            if (typeof m.content === "string") resultContent = m.content;
            else if (Array.isArray(m.content)) {
              resultContent = m.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => ({ type: "text", text: c.text }));
            }
            rawMapped.push({
              role: "user",
              content: [{
                type: "tool_result",
                tool_use_id: m.toolCallId,
                content: resultContent,
                ...(m.isError ? { is_error: true } : {}),
              }],
            });
          }
          // Skip other roles (custom, compactionSummary, etc.)
        }

        // Merge consecutive same-role messages (required by Anthropic API)
        const messages: any[] = [];
        for (const msg of rawMapped) {
          const prev = messages[messages.length - 1];
          if (prev && prev.role === msg.role) {
            const prevContent = Array.isArray(prev.content) ? prev.content : [{ type: "text", text: prev.content }];
            const curContent = Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content }];
            prev.content = [...prevContent, ...curContent];
          } else {
            messages.push(msg);
          }
        }

        const tools = (context.tools ?? []).map((t: any) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters ?? { type: "object", properties: {} },
        }));

        const body: any = {
          model: model.id,
          max_tokens: options?.maxTokens ?? model.maxTokens ?? 4096,
          messages,
          stream: true,
        };

        if (context.systemPrompt) body.system = context.systemPrompt;
        if (tools.length > 0) body.tools = tools;

        // Anthropic extended thinking — must be explicitly requested for reasoning models.
        // Without this, reasoning-capable models (Sonnet 4.6, Opus 4.5+) silently fall back
        // to standard completion with no extended thinking.
        //
        // pi passes the thinking level on SimpleStreamOptions.reasoning (a ThinkingLevel:
        // minimal | low | medium | high | xhigh) and is undefined when thinking is off.
        // The budget math mirrors pi-ai's native adjustMaxTokensForThinking so this provider
        // behaves like the built-in Anthropic provider.
        if (model.reasoning && options?.reasoning) {
          const level = options.reasoning;
          const { adaptive, xhighEffort } = thinkingSpecForModel(model);
          if (adaptive) {
            // Adaptive-thinking models (Sonnet 4.6, Opus 4.6+, Fable 5) reject
            // thinking.type="enabled". Claude decides the budget; we pass an effort
            // level via output_config. Mirrors pi-ai mapThinkingLevelToEffort: the
            // model-specific xhigh effort name, else minimal/low→low, medium→medium,
            // high (and any unknown)→high.
            let effort: string;
            switch (level) {
              case "minimal":
              case "low":
                effort = "low"; break;
              case "medium":
                effort = "medium"; break;
              case "xhigh":
                effort = xhighEffort ?? "high"; break;
              default:
                effort = "high";
            }
            body.thinking = { type: "adaptive", display: "summarized" };
            body.output_config = { effort };
          } else {
            // Budget-based thinking for older models (e.g. Opus 4.5).
            // pi-ai default per-level budgets, overridable via options.thinkingBudgets.
            // xhigh is clamped to high (no separate xhigh budget), matching clampReasoning().
            const defaultBudgets: Record<string, number> = { minimal: 1024, low: 2048, medium: 8192, high: 16384 };
            const budgets = { ...defaultBudgets, ...(options.thinkingBudgets ?? {}) };
            const clampedLevel = level === "xhigh" ? "high" : level;
            let thinkingBudget = budgets[clampedLevel];
            if (typeof thinkingBudget === "number") {
              const minOutputTokens = 1024;
              const modelMaxTokens = model.maxTokens ?? 4096;
              // Caller cap (options.maxTokens) is undefined when no explicit cap is set; then
              // use the model cap directly, otherwise fit the budget inside the requested cap.
              const baseMaxTokens = options.maxTokens;
              const maxTokens = baseMaxTokens === undefined
                ? modelMaxTokens
                : Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens);
              if (maxTokens <= thinkingBudget) {
                thinkingBudget = Math.max(0, maxTokens - minOutputTokens);
              }
              body.max_tokens = maxTokens;
              // Anthropic requires budget_tokens < max_tokens. Floor at 1024 only when
              // there's room above it; otherwise clamp to maxTokens - 1 so a tiny
              // max_tokens (e.g. caller passes 0) can't produce budget >= max_tokens.
              const budget = maxTokens > 1024
                ? Math.max(1024, Math.min(thinkingBudget, maxTokens - 1))
                : Math.min(thinkingBudget, maxTokens - 1);
              // display "summarized" matches pi-ai's default for Claude 4 models.
              body.thinking = { type: "enabled", budget_tokens: budget, display: "summarized" };
            }
          }
        }

        let response: Response;
        try {
          const token = getInferenceToken();
          response = await fetch(`${BASE_URL}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
              "anthropic-version": ANTHROPIC_VERSION,
              // Required to replay thinking blocks across tool-use turns.
              "anthropic-beta": "fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14",
            },
            body: JSON.stringify(body),
          });
        } catch (err: any) {
          output.stopReason = "error";
          output.errorMessage = `Network error: ${err.message}`;
          yield { type: "error", reason: "error", error: output };
          return;
        }

        if (!response.ok) {
          const errText = await response.text();
          output.stopReason = "error";
          output.errorMessage = `HTTP ${response.status}: ${errText}`;
          yield { type: "error", reason: "error", error: output };
          return;
        }

        yield { type: "start", partial: output };

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            let event: any;
            try { event = JSON.parse(data); } catch { continue; }

            switch (event.type) {

              case "message_start":
                if (event.message?.usage) {
                  output.usage.input = event.message.usage.input_tokens ?? 0;
                  output.usage.cacheRead = event.message.usage.cache_read_input_tokens ?? 0;
                  output.usage.cacheWrite = event.message.usage.cache_creation_input_tokens ?? 0;
                }
                break;

              case "content_block_start": {
                const cb = event.content_block;
                const idx = event.index;
                // Blocks carry a transient `index` so deltas can be matched by
                // Anthropic's content_block index (stripped at content_block_stop).
                if (cb.type === "text") {
                  output.content.push({ type: "text", text: "", index: idx });
                  yield { type: "text_start", contentIndex: output.content.length - 1, partial: output };
                } else if (cb.type === "thinking") {
                  output.content.push({ type: "thinking", thinking: "", thinkingSignature: "", index: idx });
                  yield { type: "thinking_start", contentIndex: output.content.length - 1, partial: output };
                } else if (cb.type === "redacted_thinking") {
                  output.content.push({
                    type: "thinking",
                    thinking: "[Reasoning redacted]",
                    thinkingSignature: cb.data,
                    redacted: true,
                    index: idx,
                  });
                  yield { type: "thinking_start", contentIndex: output.content.length - 1, partial: output };
                } else if (cb.type === "tool_use") {
                  output.content.push({ type: "toolCall", id: cb.id, name: cb.name, arguments: {}, rawJson: "", index: idx });
                  yield { type: "toolcall_start", contentIndex: output.content.length - 1, partial: output };
                }
                break;
              }

              case "content_block_delta": {
                const delta = event.delta;
                // O(1) fast-path: the block at event.index was pushed in order so its
                // transient .index field matches; fall back to findIndex only if not.
                let index = event.index < output.content.length && output.content[event.index]?.index === event.index
                  ? event.index
                  : output.content.findIndex((b: any) => b.index === event.index);
                const block = output.content[index];
                if (!block) break;
                if (delta.type === "text_delta" && block.type === "text") {
                  block.text += delta.text;
                  yield { type: "text_delta", contentIndex: index, delta: delta.text, partial: output };
                } else if (delta.type === "thinking_delta" && block.type === "thinking") {
                  block.thinking += delta.thinking;
                  yield { type: "thinking_delta", contentIndex: index, delta: delta.thinking, partial: output };
                } else if (delta.type === "signature_delta" && block.type === "thinking") {
                  block.thinkingSignature = (block.thinkingSignature || "") + delta.signature;
                } else if (delta.type === "input_json_delta" && block.type === "toolCall") {
                  block.rawJson += delta.partial_json;
                  try { block.arguments = JSON.parse(block.rawJson); } catch {}
                  yield { type: "toolcall_delta", contentIndex: index, delta: delta.partial_json, partial: output };
                }
                break;
              }

              case "content_block_stop": {
                // O(1) fast-path with findIndex fallback (mirrors content_block_delta).
                let index = event.index < output.content.length && output.content[event.index]?.index === event.index
                  ? event.index
                  : output.content.findIndex((b: any) => b.index === event.index);
                const block = output.content[index];
                if (!block) break;
                delete block.index;
                if (block.type === "text") {
                  yield { type: "text_end", contentIndex: index, content: block.text, partial: output };
                } else if (block.type === "thinking") {
                  yield { type: "thinking_end", contentIndex: index, content: block.thinking, partial: output };
                } else if (block.type === "toolCall") {
                  delete block.rawJson;
                  yield { type: "toolcall_end", contentIndex: index, toolCall: block, partial: output };
                }
                break;
              }

              case "message_delta":
                if (event.usage?.output_tokens) {
                  output.usage.output = event.usage.output_tokens;
                  output.usage.totalTokens = output.usage.input + output.usage.output;
                }
                {
                  // Cost = tokens × per-token list rates (from model, or resolved by id).
                  const rate = rateForModel(model);
                  const u = output.usage;
                  u.cost.input = u.input * rate.input;
                  u.cost.output = u.output * rate.output;
                  u.cost.cacheRead = u.cacheRead * rate.cacheRead;
                  u.cost.cacheWrite = u.cacheWrite * rate.cacheWrite;
                  u.cost.total = u.cost.input + u.cost.output + u.cost.cacheRead + u.cost.cacheWrite;
                }
                if (event.delta?.stop_reason) {
                  output.stopReason = event.delta.stop_reason === "end_turn" ? "stop" : event.delta.stop_reason;
                }
                break;
            }
          }
        }

        yield { type: "done", reason: output.stopReason, message: output };
      }

      const gen = generate();
      // result() must return the finalized message even when pi never iterates the
      // async iterator (compaction and branch summarization call result() directly —
      // see compaction.ts/branch-summarization.ts). finalMessage is only populated as a
      // side effect of running the generator, so drive it to completion here. Memoized
      // and safe in the normal turn path, where the agent loop iterates fully and then
      // calls result() sequentially (never concurrently with iteration).
      let driven: Promise<any> | null = null;
      const drive = () =>
        (driven ??= (async () => {
          while (!(await gen.next()).done) {
            /* drain; no-op if external iteration already exhausted the generator */
          }
          return finalMessage ?? null;
        })());
      const stream: any = {
        [Symbol.asyncIterator]: () => gen,
        result: () => drive(),
      };
      return stream;
    },
  });
}