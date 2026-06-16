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
const MODEL_SPECS: Record<string, { contextWindow: number; maxTokens: number; reasoning: boolean; cost: Cost }> = {
  "claude-haiku-4-5":  { contextWindow: 200000, maxTokens: 16384, reasoning: false, cost: HAIKU_COST  },
  "claude-sonnet-4-5": { contextWindow: 200000, maxTokens: 16384, reasoning: false, cost: SONNET_COST },
  "claude-sonnet-4-6": { contextWindow: 200000, maxTokens: 16384, reasoning: true,  cost: SONNET_COST },
  "claude-opus-4-5":   { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST   },
  "claude-opus-4-6":   { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST   },
  "claude-opus-4-7":   { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST   },
  "claude-opus-4-8":   { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST   },
  "claude-fable-5":    { contextWindow: 200000, maxTokens: 32000, reasoning: true,  cost: OPUS_COST   },
};

const SPEC_DEFAULTS = { contextWindow: 200000, maxTokens: 16384, reasoning: false, cost: ZERO_COST };

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
                if (c.type === "toolCall")
                  return { type: "tool_use", id: c.id, name: c.name, input: c.arguments ?? {} };
                return null;
              })
              .filter(Boolean);
            if (content.length > 0) rawMapped.push({ role: "assistant", content });
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

        let response: Response;
        try {
          const token = getInferenceToken();
          response = await fetch(`${BASE_URL}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
              "anthropic-version": ANTHROPIC_VERSION,
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

        const blocks: any[] = [];
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
                if (cb.type === "text") {
                  const block = { type: "text", text: "" };
                  blocks[idx] = block;
                  output.content.push(block);
                  yield { type: "text_start", contentIndex: output.content.length - 1, partial: output };
                } else if (cb.type === "tool_use") {
                  const block = { type: "toolCall", id: cb.id, name: cb.name, arguments: {} };
                  blocks[idx] = { piBlock: block, rawJson: "" };
                  output.content.push(block);
                  yield { type: "toolcall_start", contentIndex: output.content.length - 1, partial: output };
                }
                break;
              }

              case "content_block_delta": {
                const idx = event.index;
                const delta = event.delta;
                if (delta.type === "text_delta" && blocks[idx]?.text !== undefined) {
                  blocks[idx].text += delta.text;
                  yield { type: "text_delta", contentIndex: output.content.indexOf(blocks[idx]), delta: delta.text, partial: output };
                } else if (delta.type === "input_json_delta" && blocks[idx]?.rawJson !== undefined) {
                  blocks[idx].rawJson += delta.partial_json;
                  try { blocks[idx].piBlock.arguments = JSON.parse(blocks[idx].rawJson); } catch {}
                  yield { type: "toolcall_delta", contentIndex: output.content.indexOf(blocks[idx].piBlock), delta: delta.partial_json, partial: output };
                }
                break;
              }

              case "content_block_stop": {
                const idx = event.index;
                if (blocks[idx]?.text !== undefined) {
                  yield { type: "text_end", contentIndex: output.content.indexOf(blocks[idx]), partial: output };
                } else if (blocks[idx]?.piBlock) {
                  const piBlock = blocks[idx].piBlock;
                  yield { type: "toolcall_end", contentIndex: output.content.indexOf(piBlock), toolCall: piBlock, partial: output };
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
      const stream: any = {
        [Symbol.asyncIterator]: () => gen,
        result: async () => finalMessage ?? null,
      };
      return stream;
    },
  });
}