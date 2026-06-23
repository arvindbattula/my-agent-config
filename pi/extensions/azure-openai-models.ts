// Azure AI Foundry OpenAI-compatible models extension
// Handles non-Claude models (DeepSeek, Kimi, etc.) deployed as serverless MaaS
// Uses raw fetch() against the OpenAI Chat Completions SSE endpoint with
// Entra ID bearer tokens via `az cli` with automatic refresh.
//
// Configuration — set these env vars before launch:
//   AZURE_FOUNDRY_OPENAI_BASE_URL            OpenAI-compat API endpoint (e.g. https://<account>.services.ai.azure.com/openai/v1)
//   AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID   Deployment ID for DeepSeek model
//   AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID       Deployment ID for Kimi model
//   AZURE_FOUNDRY_OPENAI_MODEL_GROQ_ID       Deployment ID for Groq model (optional)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAzureToken } from "./lib/azure-token";
import { fetchWithTransientRetry, readRetryConfig } from "./lib/transient-retry";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const BASE_URL = requireEnv("AZURE_FOUNDRY_OPENAI_BASE_URL");
const COGNITIVE_SERVICES_RESOURCE = "https://cognitiveservices.azure.com";
const MODEL_DEEPSEEK_ID = requireEnv("AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID");
const MODEL_KIMI_ID = requireEnv("AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID");

// Groq model — optional; falls back gracefully if env vars not set
const MODEL_GROQ_ID = process.env["AZURE_FOUNDRY_OPENAI_MODEL_GROQ_ID"];

function getAccessToken(): string {
  return getAzureToken(COGNITIVE_SERVICES_RESOURCE);
}

// ── Model definitions ────────────────────────────────────────────────────────

const BASE_MODELS = [
  {
    id: MODEL_DEEPSEEK_ID,
    name: "DeepSeek V4 Pro (Azure)",
    reasoning: false,
    input: ["text"] as ("text" | "image")[],
    contextWindow: 1048576,
    maxTokens: 200000,
    cost: { input: 1.74, output: 3.48, cacheRead: 0, cacheWrite: 0 },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      supportsStore: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
    },
  },
  {
    id: MODEL_KIMI_ID,
    name: "Kimi K2.6 (Azure)",
    reasoning: true,
    input: ["text"] as ("text" | "image")[],
    contextWindow: 262144,
    maxTokens: 200000,
    cost: { input: 0.95, output: 4, cacheRead: 0, cacheWrite: 0 },
    thinkingLevelMap: { low: "low", medium: "medium", high: "high" } as Record<string, string>,
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      supportsStore: false,
      supportsReasoningEffort: true,
      supportsUsageInStreaming: true,
    },
  },
];

const GROQ_MODEL = MODEL_GROQ_ID
  ? {
      id: MODEL_GROQ_ID,
      name: "Groq Code Fast 1 (Azure)",
      reasoning: false,
      input: ["text"] as ("text" | "image")[],
      contextWindow: 256000,
      maxTokens: 8192,
      cost: { input: 0.2, output: 1.5, cacheRead: 0, cacheWrite: 0 },
      compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
        supportsStore: false,
        supportsReasoningEffort: false,
        supportsUsageInStreaming: true,
      },
    }
  : undefined;

const MODELS = GROQ_MODEL ? [...BASE_MODELS, GROQ_MODEL] : BASE_MODELS;

// ── Message conversion ───────────────────────────────────────────────────────

function convertMessages(context: any): any[] {
  const params: any[] = [];

  if (context.systemPrompt) {
    params.push({ role: "system", content: context.systemPrompt });
  }

  for (const msg of context.messages ?? []) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        params.push({ role: "user", content: msg.content });
      } else {
        const parts = (msg.content ?? [])
          .filter((c: any) => c.type === "text")
          .map((c: any) => ({ type: "text", text: c.text }));
        if (parts.length > 0) params.push({ role: "user", content: parts });
      }
    } else if (msg.role === "assistant") {
      const textParts = (msg.content ?? []).filter((c: any) => c.type === "text" && c.text.trim());
      const text = textParts.map((c: any) => c.text).join("");
      const toolCalls = (msg.content ?? []).filter((c: any) => c.type === "toolCall");

      // Skip empty assistant messages with no tool calls
      if (!text && toolCalls.length === 0) continue;

      const assistantMsg: any = { role: "assistant", content: text || null };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map((tc: any) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
      }
      params.push(assistantMsg);
    } else if (msg.role === "toolResult") {
      const text = Array.isArray(msg.content)
        ? msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n")
        : String(msg.content ?? "");
      params.push({ role: "tool", content: text, tool_call_id: msg.toolCallId });
    }
    // Skip other roles (compactionSummary, custom, etc.)
  }

  return params;
}

function convertTools(tools: any[]): any[] {
  return (tools ?? []).map((t: any) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters ?? { type: "object", properties: {} },
    },
  }));
}

// ── Cost calculation ─────────────────────────────────────────────────────────

function calculateCost(model: any, usage: any): void {
  const u = usage;
  u.cost.input = (model.cost.input / 1_000_000) * u.input;
  u.cost.output = (model.cost.output / 1_000_000) * u.output;
  u.cost.cacheRead = 0;
  u.cost.cacheWrite = 0;
  u.cost.total = u.cost.input + u.cost.output;
}

// ── SSE stream parser ────────────────────────────────────────────────────────

function streamAzureOpenAI(model: any, context: any, options: any) {
  let finalMessage: any = null;

  async function* generate() {
    const output: any = {
      role: "assistant",
      content: [],
      api: "openai-completions",
      provider: "azure-openai-models",
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
    try {
      const messages = convertMessages(context);
      const tools = convertTools(context.tools);

      const body: any = {
        model: model.id,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      };
      const maxTokens = options?.maxTokens ?? model.maxTokens;
      if (maxTokens) {
        body[model.compat?.maxTokensField ?? "max_tokens"] = maxTokens;
      }
      if (options?.reasoningEffort && model.reasoning && model.compat?.supportsReasoningEffort) {
        body.reasoning_effort = model.thinkingLevelMap?.[options.reasoningEffort] ?? options.reasoningEffort;
      }
      if (tools.length > 0) body.tools = tools;

      // Push `start` before any fetch so pi's UI/session always has a message
      // anchor for this turn, even if the request fails before any SSE event
      // arrives. Pi's TUI keys the assistant message lifecycle off `start`;
      // without it, an early error event has no message to attach to.
      yield { type: "start", partial: output };

      // In-extension retry on transient errors (429, 5xx, fetch failures) keeps
      // each failed attempt out of pi's chat UI. Pair with `retry.enabled: false`
      // in settings.json so pi's outer auto-retry doesn't stack on top. Env knobs
      // are independent of the Anthropic extension's so OpenAI-compat deployments
      // can be tuned separately.
      const retryCfg = readRetryConfig(
        "AZURE_FOUNDRY_OPENAI_MAX_RETRIES",
        "AZURE_FOUNDRY_OPENAI_RETRY_BASE_DELAY_MS",
      );
      const fetchResult = await fetchWithTransientRetry(
        () =>
          fetch(`${BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Refresh token on every attempt; long backoffs can outlive the cache buffer.
              "Authorization": `Bearer ${getAccessToken()}`,
            },
            body: JSON.stringify(body),
            signal: options?.signal,
          }),
        retryCfg,
      );
      if (!fetchResult.ok) {
        // Preserve pi-ai abort semantics: when the user cancels (AbortSignal),
        // report stopReason "aborted" rather than "error". The outer catch block
        // below uses the same convention for failures during streaming.
        output.stopReason = fetchResult.aborted ? "aborted" : "error";
        output.errorMessage = fetchResult.errorMessage;
        yield { type: "error", reason: output.stopReason, error: output };
        return;
      }
      const response = fetchResult.response;

      // Block tracking
      let textBlock: any = null;
      let thinkingBlock: any = null;
      const toolCallsByIndex = new Map<number, any>();

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

          let chunk: any;
          try { chunk = JSON.parse(data); } catch { continue; }

          // Usage (final chunk with include_usage)
          if (chunk.usage) {
            const u = chunk.usage;
            output.usage.input = u.prompt_tokens ?? 0;
            output.usage.output = u.completion_tokens ?? 0;
            output.usage.cacheRead = u.prompt_tokens_details?.cached_tokens ?? 0;
            output.usage.totalTokens = output.usage.input + output.usage.output;
            calculateCost(model, output.usage);
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          // Finish reason
          if (choice.finish_reason) {
            switch (choice.finish_reason) {
              case "stop": case "end": output.stopReason = "stop"; break;
              case "length": output.stopReason = "length"; break;
              case "tool_calls": output.stopReason = "toolUse"; break;
              case "content_filter":
                throw new Error("Provider finish_reason: content_filter");
            }
          }

          const delta = choice.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            if (!textBlock) {
              textBlock = { type: "text", text: "" };
              output.content.push(textBlock);
              yield { type: "text_start", contentIndex: output.content.length - 1, partial: output };
            }
            textBlock.text += delta.content;
            yield { type: "text_delta", contentIndex: output.content.indexOf(textBlock), delta: delta.content, partial: output };
          }

          // Reasoning / thinking content (Kimi uses reasoning_content)
          const reasoning = delta.reasoning_content ?? delta.reasoning ?? delta.reasoning_text;
          if (typeof reasoning === "string" && reasoning.length > 0) {
            if (!thinkingBlock) {
              thinkingBlock = { type: "thinking", thinking: "" };
              output.content.push(thinkingBlock);
              yield { type: "thinking_start", contentIndex: output.content.length - 1, partial: output };
            }
            thinkingBlock.thinking += reasoning;
            yield { type: "thinking_delta", contentIndex: output.content.indexOf(thinkingBlock), delta: reasoning, partial: output };
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let block = toolCallsByIndex.get(idx);
              if (!block) {
                block = { type: "toolCall", id: tc.id ?? "", name: tc.function?.name ?? "", arguments: {}, _rawArgs: "" };
                toolCallsByIndex.set(idx, block);
                output.content.push(block);
                yield { type: "toolcall_start", contentIndex: output.content.length - 1, partial: output };
              }
              if (tc.id && !block.id) block.id = tc.id;
              if (tc.function?.name && !block.name) block.name = tc.function.name;

              let argDelta = "";
              if (tc.function?.arguments) {
                argDelta = tc.function.arguments;
                block._rawArgs += argDelta;
                try { block.arguments = JSON.parse(block._rawArgs); } catch { /* partial JSON, keep accumulating */ }
              }
              yield { type: "toolcall_delta", contentIndex: output.content.indexOf(block), delta: argDelta, partial: output };
            }
          }
        }
      }

      // End all open blocks
      if (textBlock) {
        yield { type: "text_end", contentIndex: output.content.indexOf(textBlock), content: textBlock.text, partial: output };
      }
      if (thinkingBlock) {
        yield { type: "thinking_end", contentIndex: output.content.indexOf(thinkingBlock), content: thinkingBlock.thinking, partial: output };
      }
      for (const block of toolCallsByIndex.values()) {
        // Final parse attempt and strip scratch buffer
        if (block._rawArgs) {
          try { block.arguments = JSON.parse(block._rawArgs); } catch { /* best-effort */ }
        }
        delete block._rawArgs;
        yield { type: "toolcall_end", contentIndex: output.content.indexOf(block), toolCall: block, partial: output };
      }

      finalMessage = output;
      yield { type: "done", reason: output.stopReason, message: output };
    } catch (error) {
      for (const block of output.content) {
        delete block._rawArgs;
      }
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      yield { type: "error", reason: output.stopReason, error: output };
    }
  }

  const gen = generate();
  // result() must return the finalized message even when pi never iterates the
  // async iterator (compaction and branch summarization call result() directly).
  // finalMessage is only populated as a side effect of running the generator, so
  // drive it to completion here. Memoized and safe in the normal turn path, where
  // the agent loop iterates fully and then calls result() sequentially.
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
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerProvider("azure-openai-models", {
    api: "openai-completions",
    baseUrl: BASE_URL,
    apiKey: "entra-id",
    models: MODELS,
    streamSimple: streamAzureOpenAI,
  });
}
