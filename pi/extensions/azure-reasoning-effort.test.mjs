// Regression test: reasoning_effort mapping in azure-openai-models.ts.
//
// Bug: the extension read options.reasoningEffort (an internal field of pi-ai's
// openai-completions.streamSimple wrapper) instead of options.reasoning (the
// actual SimpleStreamOptions field). Since provider-composer.js calls extension
// .streamSimple directly, bypassing pi-ai's wrapper, options.reasoningEffort was
// always undefined and Kimi never received reasoning_effort.
//
// This test stubs fetch to capture the outbound request body and asserts:
// - reasoning: "high"  → body.reasoning_effort === "high"
// - reasoning: "low"   → body.reasoning_effort === "low"
// - reasoning: "medium" → body.reasoning_effort === "medium"
// - reasoning: "off"   → reasoning_effort absent
// - reasoning: undefined → reasoning_effort absent
// - reasoning: "minimal" → clamped to "low" (Kimi doesn't support minimal)
// - reasoning: "xhigh"  → clamped to "high" (Kimi doesn't support xhigh)
// - non-reasoning model (DeepSeek) → reasoning_effort absent regardless
//
// Requires Node's native TypeScript type stripping (Node >= 23.6).
//
// Run: node pi/extensions/azure-reasoning-effort.test.mjs

import assert from "node:assert/strict";
import { register } from "node:module";

// Resolve extensionless relative imports inside the .ts extensions.
register("./ts-resolve-hook.mjs", import.meta.url);

// Required env vars read at module load time.
process.env.AZURE_FOUNDRY_BASE_URL ??= "https://test.invalid/anthropic/v1";
process.env.AZURE_FOUNDRY_ARM_SUBSCRIPTION ??= "00000000-0000-0000-0000-000000000000";
process.env.AZURE_FOUNDRY_ARM_RESOURCE_GROUP ??= "test-rg";
process.env.AZURE_FOUNDRY_ARM_ACCOUNT ??= "test-account";
process.env.AZURE_FOUNDRY_OPENAI_BASE_URL ??= "https://test.invalid/openai/v1";
process.env.AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID ??= "test-deepseek";
process.env.AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID ??= "test-kimi";
// Disable retry so failed/slow fetches don't loop.
process.env.AZURE_FOUNDRY_OPENAI_MAX_RETRIES = "0";
process.env.AZURE_FOUNDRY_OPENAI_RETRY_BASE_DELAY_MS = "0";

const CONTEXT = { systemPrompt: "test", messages: [{ role: "user", content: "hi" }], tools: [] };

// Kimi-like model with the updated thinkingLevelMap (explicit nulls for unsupported levels).
const KIMI_MODEL = {
  id: "test-kimi",
  name: "Kimi K2.6 (Azure)",
  reasoning: true,
  maxTokens: 200000,
  cost: { input: 0.95, output: 4, cacheRead: 0, cacheWrite: 0 },
  thinkingLevelMap: { minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null },
  compat: {
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
    supportsStore: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
  },
};

// DeepSeek-like model (non-reasoning).
const DEEPSEEK_MODEL = {
  id: "test-deepseek",
  name: "DeepSeek V4 Pro (Azure)",
  reasoning: false,
  maxTokens: 200000,
  cost: { input: 1.74, output: 3.48, cacheRead: 0, cacheWrite: 0 },
  compat: {
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
    supportsStore: false,
    supportsReasoningEffort: false,
    supportsUsageInStreaming: true,
  },
};

// Stub fetch to capture the request body and return a minimal SSE response.
// The response body is empty (just [DONE]) so the stream ends immediately
// with stopReason "stop" — we only care about the captured request body.
let capturedBody = null;
function makeCapturingFetch() {
  return async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    // Return a 200 with an empty SSE stream that closes immediately.
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
}

async function getStreamSimple() {
  let captured;
  const fakePi = {
    registerProvider: (_name, config) => { captured = config.streamSimple; },
  };
  const mod = await import("./azure-openai-models.ts");
  mod.default(fakePi);
  assert.ok(typeof captured === "function", "streamSimple should be registered");
  return captured;
}

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ok - ${name}`); };

const streamSimple = await getStreamSimple();

// Helper: run streamSimple with a model and reasoning option, return captured body.
async function captureBody(model, options) {
  capturedBody = null;
  globalThis.fetch = makeCapturingFetch();
  const stream = await streamSimple(model, CONTEXT, options);
  // Drain the stream to drive the generator to completion.
  for await (const _ of stream) { /* drain */ }
  assert.ok(capturedBody, "fetch should have been called and body captured");
  return capturedBody;
}

// ── Kimi: reasoning_effort sent correctly for supported levels ────────────────

await check("Kimi reasoning:high → body.reasoning_effort === 'high'", async () => {
  const body = await captureBody(KIMI_MODEL, { reasoning: "high" });
  assert.equal(body.reasoning_effort, "high");
});

await check("Kimi reasoning:medium → body.reasoning_effort === 'medium'", async () => {
  const body = await captureBody(KIMI_MODEL, { reasoning: "medium" });
  assert.equal(body.reasoning_effort, "medium");
});

await check("Kimi reasoning:low → body.reasoning_effort === 'low'", async () => {
  const body = await captureBody(KIMI_MODEL, { reasoning: "low" });
  assert.equal(body.reasoning_effort, "low");
});

// ── Kimi: "off" and undefined → reasoning_effort absent ───────────────────────

await check("Kimi reasoning:off → reasoning_effort absent", async () => {
  const body = await captureBody(KIMI_MODEL, { reasoning: "off" });
  assert.equal(body.reasoning_effort, undefined,
    "'off' must not be sent as reasoning_effort (mirrors pi-ai: off → omit)");
});

await check("Kimi reasoning:undefined → reasoning_effort absent", async () => {
  const body = await captureBody(KIMI_MODEL, {});
  assert.equal(body.reasoning_effort, undefined);
});

// ── Kimi: unsupported levels clamped to nearest supported ─────────────────────

await check("Kimi reasoning:minimal → clamped to 'low'", async () => {
  const body = await captureBody(KIMI_MODEL, { reasoning: "minimal" });
  assert.equal(body.reasoning_effort, "low",
    "minimal is not supported by Kimi; clamp forward to 'low'");
});

await check("Kimi reasoning:xhigh → clamped to 'high'", async () => {
  const body = await captureBody(KIMI_MODEL, { reasoning: "xhigh" });
  assert.equal(body.reasoning_effort, "high",
    "xhigh is not supported by Kimi; clamp backward to 'high'");
});

await check("Kimi reasoning:max → clamped to 'high'", async () => {
  const body = await captureBody(KIMI_MODEL, { reasoning: "max" });
  assert.equal(body.reasoning_effort, "high",
    "max is not supported by Kimi; clamp backward to 'high'");
});

// ── DeepSeek: non-reasoning model never gets reasoning_effort ─────────────────

await check("DeepSeek reasoning:high → reasoning_effort absent (non-reasoning model)", async () => {
  const body = await captureBody(DEEPSEEK_MODEL, { reasoning: "high" });
  assert.equal(body.reasoning_effort, undefined,
    "non-reasoning model must not receive reasoning_effort regardless of options");
});

// ── Old field name must NOT work (regression guard) ───────────────────────────

await check("Kimi with reasoningEffort (old field) → reasoning_effort absent (proves fix)", async () => {
  // This is the OLD broken behavior: if someone accidentally uses the internal
  // field name, it should NOT produce reasoning_effort. This proves we read
  // options.reasoning, not options.reasoningEffort.
  const body = await captureBody(KIMI_MODEL, { reasoningEffort: "high" });
  assert.equal(body.reasoning_effort, undefined,
    "options.reasoningEffort is NOT the field we read — only options.reasoning should work");
});

console.log(`\n${passed} checks passed`);
