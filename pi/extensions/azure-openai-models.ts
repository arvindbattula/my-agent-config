// Azure AI Foundry OpenAI-compatible models extension
// Handles non-Claude models (DeepSeek, Kimi, etc.) deployed as serverless MaaS
// Uses pi-ai's built-in streamSimpleOpenAICompletions for streaming
// Auth: Entra ID bearer tokens via `az cli` with automatic refresh
//
// Configuration — set these env vars before launch:
//   AZURE_FOUNDRY_OPENAI_BASE_URL            OpenAI-compat API endpoint (e.g. https://<account>.services.ai.azure.com/openai/v1)
//   AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID   Deployment ID for DeepSeek model
//   AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID       Deployment ID for Kimi model

import { execSync } from "node:child_process";
import {
  streamSimpleOpenAICompletions,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const BASE_URL = requireEnv("AZURE_FOUNDRY_OPENAI_BASE_URL");

// Deployment IDs — configured via env vars to keep internal naming confidential.
// Defaults are placeholders; set the actual deployment IDs in your environment.
const MODEL_DEEPSEEK_ID = process.env.AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID || "deepseek-v4-pro";
const MODEL_KIMI_ID = process.env.AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID || "kimi-k2-6";

// ── Token cache ──────────────────────────────────────────────────────────────

let token: string | null = null;
let tokenExpiry = 0;

function getAccessToken(): string {
  const now = Date.now();
  if (token && now < tokenExpiry - 60_000) return token;
  const json = execSync(
    "az account get-access-token --resource https://cognitiveservices.azure.com -o json",
    { encoding: "utf-8", timeout: 15_000 },
  );
  const parsed = JSON.parse(json);
  token = parsed.accessToken;
  tokenExpiry = new Date(parsed.expiresOn).getTime();
  return token!;
}

// ── Model definitions ────────────────────────────────────────────────────────
// Add new non-Claude Azure deployments here.
// DeepSeek V4 Pro pricing: $1.74/$3.48 per 1M tokens (input/output)
// Kimi K2.6 pricing: $0.95/$4 per 1M tokens (input/output)
// NOTE: maxTokens = max OUTPUT tokens per response. Must be < contextWindow.
//       Setting it equal to contextWindow causes "exceeds context length" errors
//       because the API requires: input_tokens + max_tokens <= contextWindow.

interface AzureOpenAIModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  compat: {
    supportsDeveloperRole: boolean;
    maxTokensField: string;
    supportsStore: boolean;
    supportsReasoningEffort: boolean;
    supportsUsageInStreaming: boolean;
  };
}

const MODELS: AzureOpenAIModel[] = [
  {
    id: MODEL_DEEPSEEK_ID,
    name: "DeepSeek V4 Pro (Azure)",
    reasoning: false,
    input: ["text"],
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
    input: ["text"],
    contextWindow: 262144,
    maxTokens: 262144,
    cost: { input: 0.95, output: 4, cacheRead: 0, cacheWrite: 0 },
    compat: {
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      supportsStore: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
    },
  },
];

// ── Stream wrapper ───────────────────────────────────────────────────────────
// Injects a fresh Entra ID token before each request.

function streamAzureOpenAI(
  model: Model<"openai-completions">,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    try {
      const freshToken = getAccessToken();
      const modelWithBase = { ...model, baseUrl: BASE_URL };
      const innerStream = streamSimpleOpenAICompletions(modelWithBase, context, {
        ...options,
        apiKey: freshToken,
        maxTokens: options?.maxTokens ?? model.maxTokens,
      });

      for await (const event of innerStream) stream.push(event);
      stream.end();
    } catch (error) {
      stream.push({
        type: "error",
        reason: "error",
        error: {
          role: "assistant",
          content: [],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        },
      });
      stream.end();
    }
  })();

  return stream;
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerProvider("azure-openai-models", {
    api: "openai-completions",
    baseUrl: BASE_URL,
    apiKey: "entra-id",
    models: MODELS.map(({ compat, ...model }) => ({ ...model, compat })),
    streamSimple: streamAzureOpenAI,
  });
}