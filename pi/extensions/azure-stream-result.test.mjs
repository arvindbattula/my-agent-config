// Regression test for the streamSimple result() contract.
//
// Bug: result() previously read a closure variable that is only populated as a
// side effect of iterating the async generator. pi's compaction and branch
// summarization call result() WITHOUT iterating (see compaction.ts /
// branch-summarization.ts), so it returned null and pi crashed reading
// `.stopReason`. The fix makes result() drive the generator to completion.
//
// This test drives the REAL extension streamSimple with network disabled, so a
// future revert of the fix (result returning null without iteration) fails here.
//
// Requires Node's native TypeScript type stripping to import the .ts extensions:
// on by default on Node >= 23.6, or via --experimental-strip-types on 22.6-23.5.
// (ts-resolve-hook.mjs only handles extensionless import resolution, not parsing.)
//
// Run (Node >= 23.6):       node pi/extensions/azure-stream-result.test.mjs
// Run (Node 22.6-23.5):     node --experimental-strip-types pi/extensions/azure-stream-result.test.mjs

import assert from "node:assert/strict";
import { register } from "node:module";

// Resolve extensionless relative imports inside the .ts extensions.
register("./ts-resolve-hook.mjs", import.meta.url);

// Network off: ARM discovery falls back to cache; the inference call errors out.
// Either way the generator finalizes a message — what we assert on.
globalThis.fetch = async () => {
  throw new Error("network disabled in test");
};

// Required env vars read at module load. Both providers' module-level
// requireEnv() calls run when the test imports them — a clean CI/dev shell
// without any AZURE_FOUNDRY_* env vars would otherwise crash at import
// before any check could run.
process.env.AZURE_FOUNDRY_BASE_URL ??= "https://test.invalid/anthropic/v1";
process.env.AZURE_FOUNDRY_ARM_SUBSCRIPTION ??= "00000000-0000-0000-0000-000000000000";
process.env.AZURE_FOUNDRY_ARM_RESOURCE_GROUP ??= "test-rg";
process.env.AZURE_FOUNDRY_ARM_ACCOUNT ??= "test-account";
process.env.AZURE_FOUNDRY_OPENAI_BASE_URL ??= "https://test.invalid/openai/v1";
process.env.AZURE_FOUNDRY_OPENAI_MODEL_DEEPSEEK_ID ??= "test-deepseek";
process.env.AZURE_FOUNDRY_OPENAI_MODEL_KIMI_ID ??= "test-kimi";
// Disable the in-extension retry loop so the network-disabled fetch fails fast.
// Prod default is 3 retries with 2s exponential backoff (~14s); tests don't need it.
// Force-overwrite (`=`, not `??=`) so a developer/CI env with these set doesn't make
// the test slow/flaky.
process.env.AZURE_FOUNDRY_MAX_RETRIES = "0";
process.env.AZURE_FOUNDRY_RETRY_BASE_DELAY_MS = "0";
process.env.AZURE_FOUNDRY_OPENAI_MAX_RETRIES = "0";
process.env.AZURE_FOUNDRY_OPENAI_RETRY_BASE_DELAY_MS = "0";

const CONTEXT = { systemPrompt: "test", messages: [{ role: "user", content: "hi" }], tools: [] };
const MODEL = {
  id: "claude-sonnet-4-5",
  name: "Claude Sonnet 4.5 (Azure)",
  reasoning: false,
  maxTokens: 16384,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

async function getStreamSimple(modulePath) {
  let captured;
  const fakePi = {
    registerProvider: (_name, config) => {
      captured = config.streamSimple;
    },
  };
  const mod = await import(modulePath);
  await mod.default(fakePi);
  assert.ok(typeof captured === "function", "streamSimple should be registered");
  return captured;
}

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ok - ${name}`); };

for (const modulePath of ["./azure-foundry.ts", "./azure-openai-models.ts"]) {
  const streamSimple =
    modulePath === "./azure-foundry.ts"
      ? await getStreamSimple(modulePath)
      // azure-openai-models registers streamFn the same way via default export
      : await getStreamSimple(modulePath);

  // Compaction path: result() must NOT be null without iteration. Pre-fix this
  // returned null and pi threw "Cannot read properties of null (reading 'stopReason')".
  await check(`${modulePath}: result() without iteration returns non-null message`, async () => {
    const stream = await streamSimple(MODEL, CONTEXT, {});
    const msg = await stream.result();
    assert.notEqual(msg, null, "result() must return a finalized message, not null");
    assert.equal(typeof msg.stopReason, "string", "stopReason must be readable");
    assert.equal(msg.role, "assistant");
    // Network is disabled, so this run finalizes as an error — the point is it is
    // a real finalized message, never null.
    assert.equal(msg.stopReason, "error");
    assert.ok(msg.errorMessage, "error path should carry an errorMessage");
  });

  // Normal turn path: iterate fully, then result() (agent-loop ordering).
  await check(`${modulePath}: iterate-then-result returns same finalized message`, async () => {
    const stream = await streamSimple(MODEL, CONTEXT, {});
    let lastType;
    for await (const ev of stream) lastType = ev.type;
    const msg = await stream.result();
    assert.notEqual(msg, null);
    assert.equal(msg.stopReason, "error");
    assert.equal(lastType, "error");
  });

  // result() is idempotent.
  await check(`${modulePath}: result() memoized across calls`, async () => {
    const stream = await streamSimple(MODEL, CONTEXT, {});
    const a = await stream.result();
    const b = await stream.result();
    assert.equal(a, b);
  });
}

// ── azure-foundry.ts retry-loop coverage ──────────────────────────────────────
// Asserts the internal retry loop on transient HTTP statuses (429/500-504/529)
// silently swallows N attempts and only yields a single error event at the end.
// Pairs with `retry.enabled: false` in user settings so the TUI shows ONE
// "Error: …" line instead of one per attempt.

const foundryStreamSimple = await getStreamSimple("./azure-foundry.ts");
let fetchCalls = 0;
const stubTransientFetch = (status, body) => async () => {
  fetchCalls++;
  return new Response(body, { status, headers: { "content-type": "application/json" } });
};

// Run the same two retry-loop assertions against both providers — they share
// `lib/transient-retry.ts` but each owns its own env var namespace and fetch URL.
const RETRY_PROVIDERS = [
  {
    label: "azure-foundry",
    streamSimple: foundryStreamSimple,
    maxEnv: "AZURE_FOUNDRY_MAX_RETRIES",
  },
  {
    label: "azure-openai-models",
    streamSimple: await getStreamSimple("./azure-openai-models.ts"),
    maxEnv: "AZURE_FOUNDRY_OPENAI_MAX_RETRIES",
  },
];

for (const { label, streamSimple, maxEnv } of RETRY_PROVIDERS) {
  await check(`${label} retry loop: 529 retried MAX_RETRIES+1 times, one error event`, async () => {
    // Allow 2 retries (3 total attempts) with zero delay so we can assert the count.
    const prevMax = process.env[maxEnv];
    process.env[maxEnv] = "2";
    fetchCalls = 0;
    globalThis.fetch = stubTransientFetch(
      529,
      JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
    );
    try {
      const stream = await streamSimple(MODEL, CONTEXT, {});
      let errorEvents = 0;
      let startEvents = 0;
      for await (const ev of stream) {
        if (ev.type === "start") startEvents++;
        if (ev.type === "error") errorEvents++;
      }
      assert.equal(startEvents, 1, "exactly one start event before any retries");
      assert.equal(errorEvents, 1, "exactly one error event after retries exhaust");
      assert.equal(fetchCalls, 3, "3 fetch attempts = initial + 2 retries");
      const msg = await stream.result();
      assert.equal(msg.stopReason, "error");
      assert.match(msg.errorMessage, /^529 /, "errorMessage matches pi-ai canonical `${status} ${body}`");
      assert.match(msg.errorMessage, /overloaded/i, "body keyword present for pi's retry matcher");
    } finally {
      process.env[maxEnv] = prevMax ?? "0";
    }
  });

  await check(`${label} retry loop: non-transient 400 does NOT retry`, async () => {
    const prevMax = process.env[maxEnv];
    process.env[maxEnv] = "3";
    fetchCalls = 0;
    globalThis.fetch = stubTransientFetch(400, '{"error":"bad request"}');
    try {
      const stream = await streamSimple(MODEL, CONTEXT, {});
      for await (const _ of stream) { /* drain */ }
      assert.equal(fetchCalls, 1, "non-transient status must not retry");
      const msg = await stream.result();
      assert.match(msg.errorMessage, /^400 /);
    } finally {
      process.env[maxEnv] = prevMax ?? "0";
    }
  });
}

// Guards against the abortable-backoff path regressing — a user cancel
// DURING the exponential-backoff sleep between retries must wake the sleep
// early instead of waiting out the full delay. Without abort-aware sleep,
// a cancel during an 8s backoff would feel completely unresponsive.
await check("azure-openai-models retry loop: abort during backoff wakes sleep early", async () => {
  const prevMax = process.env.AZURE_FOUNDRY_OPENAI_MAX_RETRIES;
  const prevDelay = process.env.AZURE_FOUNDRY_OPENAI_RETRY_BASE_DELAY_MS;
  process.env.AZURE_FOUNDRY_OPENAI_MAX_RETRIES = "3";
  process.env.AZURE_FOUNDRY_OPENAI_RETRY_BASE_DELAY_MS = "2000";  // first backoff = 2s; abort at 50ms
  fetchCalls = 0;
  const controller = new AbortController();
  globalThis.fetch = async (_url, opts) => {
    fetchCalls++;
    if (opts?.signal?.aborted) {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      throw err;
    }
    // First call: return 529 to force entry into the backoff sleep.
    return new Response(
      JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
      { status: 529 },
    );
  };
  // Fire the abort 50ms in — well inside the 2000ms first-backoff window.
  setTimeout(() => controller.abort(), 50);
  try {
    const openaiStreamSimple = await getStreamSimple("./azure-openai-models.ts");
    const t0 = Date.now();
    const stream = await openaiStreamSimple(MODEL, CONTEXT, { signal: controller.signal });
    for await (const _ of stream) { /* drain */ }
    const elapsed = Date.now() - t0;
    const msg = await stream.result();
    assert.ok(
      elapsed < 500,
      `aborted backoff sleep should wake within ~50ms, was ${elapsed}ms (full 2000ms means abort wasn't threaded)`,
    );
    assert.equal(msg.stopReason, "aborted", "abort during backoff surfaces as 'aborted', not 'error'");
    assert.equal(fetchCalls, 1, "must NOT issue a second fetch after abort during sleep");
  } finally {
    process.env.AZURE_FOUNDRY_OPENAI_MAX_RETRIES = prevMax ?? "0";
    process.env.AZURE_FOUNDRY_OPENAI_RETRY_BASE_DELAY_MS = prevDelay ?? "0";
  }
});

// Guards against fractional maxRetries silently adding an attempt at the
// boundary. "2.5" must be floored to 2 -> 3 total attempts, not 4.
await check("readRetryConfig: fractional maxRetries is floored to integer", async () => {
  const prevMax = process.env.AZURE_FOUNDRY_MAX_RETRIES;
  process.env.AZURE_FOUNDRY_MAX_RETRIES = "2.5";
  fetchCalls = 0;
  globalThis.fetch = stubTransientFetch(
    529,
    JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
  );
  try {
    const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
    for await (const _ of stream) { /* drain */ }
    assert.equal(
      fetchCalls,
      3,
      "fractional 2.5 -> floor(2.5)=2 retries -> 3 attempts; unfloored would give 4 with attempt<=2.5",
    );
  } finally {
    process.env.AZURE_FOUNDRY_MAX_RETRIES = prevMax ?? "0";
  }
});

// Guards against the AbortError detection regressing — user cancellations
// must NOT be retried and must surface stopReason: "aborted" instead of "error".
await check("azure-openai-models retry loop: AbortError exits immediately as aborted", async () => {
  const prevMax = process.env.AZURE_FOUNDRY_OPENAI_MAX_RETRIES;
  process.env.AZURE_FOUNDRY_OPENAI_MAX_RETRIES = "3";  // would be 4 attempts if abort were retried
  fetchCalls = 0;
  // Pre-aborted controller — fetch rejects with DOMException 'AbortError'.
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_url, opts) => {
    fetchCalls++;
    if (opts?.signal?.aborted) {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      throw err;
    }
    return new Response("", { status: 200 });
  };
  try {
    const openaiStreamSimple = await getStreamSimple("./azure-openai-models.ts");
    const stream = await openaiStreamSimple(MODEL, CONTEXT, { signal: controller.signal });
    for await (const _ of stream) { /* drain */ }
    // 0 when the helper detects the pre-aborted signal before calling doFetch
    // (current behavior), or 1 if it lets the first fetch throw AbortError.
    // Either way is correct: the contract is "don't retry on abort" (i.e. <=1).
    assert.ok(fetchCalls <= 1, `abort must short-circuit retries (got ${fetchCalls} attempts, want <=1)`);
    const msg = await stream.result();
    assert.equal(msg.stopReason, "aborted", "abort surfaces as stopReason 'aborted', not 'error'");
    assert.ok(msg.errorMessage, "errorMessage is still populated for context");
  } finally {
    process.env.AZURE_FOUNDRY_OPENAI_MAX_RETRIES = prevMax ?? "0";
  }
});

// Guards against the readRetryConfig sanitization regressing — NaN/negative/empty
// env values must fall back to defaults instead of producing an unrunnable loop.
await check("azure-foundry retry loop: invalid env (NaN) falls back to default, retries on 529", async () => {
  const prevMax = process.env.AZURE_FOUNDRY_MAX_RETRIES;
  const prevDelay = process.env.AZURE_FOUNDRY_RETRY_BASE_DELAY_MS;
  process.env.AZURE_FOUNDRY_MAX_RETRIES = "not-a-number";
  process.env.AZURE_FOUNDRY_RETRY_BASE_DELAY_MS = "0";  // keep test fast: still valid (>=0)
  fetchCalls = 0;
  globalThis.fetch = stubTransientFetch(
    529,
    JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
  );
  try {
    const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
    for await (const _ of stream) { /* drain */ }
    // Default maxRetries=3 -> 4 total attempts. Critically NOT zero (which is
    // what `Number("not-a-number")` -> NaN -> falsy attempt loop would have given).
    assert.equal(fetchCalls, 4, "invalid env should fall back to default 3 retries (4 attempts)");
  } finally {
    process.env.AZURE_FOUNDRY_MAX_RETRIES = prevMax ?? "0";
    process.env.AZURE_FOUNDRY_RETRY_BASE_DELAY_MS = prevDelay ?? "0";
  }
});

// ── Stop-reason mapping tests (pi 0.83 alignment) ─────────────────────────────
// Pi 0.83 (#7272) surfaces unmapped terminal stop reasons as provider errors
// instead of successful stops. Our extensions must map known provider stop
// reasons to pi's canonical names. Also tests the "pending" stop reason
// (#7151) for streams that end without a terminal stop reason.

/** Build a Response with a ReadableStream body containing SSE lines. */
function sseResponse(lines) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

// ── azure-foundry.ts: STOP_REASON_MAP correctness ────────────────────────────

await check("azure-foundry: tool_use stop_reason → canonical 'toolUse'", async () => {
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 5 } } }),
    JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }),
    JSON.stringify({ type: "content_block_stop", index: 0 }),
    JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 3 } }),
  ]);
  const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "toolUse", `tool_use must map to 'toolUse', got '${msg.stopReason}'`);
});

await check("azure-foundry: max_tokens stop_reason → canonical 'length'", async () => {
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 5 } } }),
    JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }),
    JSON.stringify({ type: "content_block_stop", index: 0 }),
    JSON.stringify({ type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 3 } }),
  ]);
  const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "length", `max_tokens must map to 'length', got '${msg.stopReason}'`);
});

await check("azure-foundry: stop_sequence stop_reason → canonical 'stop'", async () => {
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 5 } } }),
    JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }),
    JSON.stringify({ type: "content_block_stop", index: 0 }),
    JSON.stringify({ type: "message_delta", delta: { stop_reason: "stop_sequence" }, usage: { output_tokens: 3 } }),
  ]);
  const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "stop", `stop_sequence must map to 'stop', got '${msg.stopReason}'`);
});

await check("azure-foundry: end_turn stop_reason → canonical 'stop'", async () => {
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 5 } } }),
    JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }),
    JSON.stringify({ type: "content_block_stop", index: 0 }),
    JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }),
  ]);
  const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "stop", `end_turn must map to 'stop', got '${msg.stopReason}'`);
});

await check("azure-foundry: stream ending without stop_reason → 'pending'", async () => {
  // SSE stream with content but NO message_delta/stop_reason event — simulates
  // a dropped connection or truncated response.
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 5 } } }),
    JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial..." } }),
    // No content_block_stop, no message_delta — stream just ends.
  ]);
  const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "pending", `stream without terminal stop_reason should be 'pending', got '${msg.stopReason}'`);
});

// ── azure-openai-models.ts: partial-stream pending fallback ──────────────────

await check("azure-openai-models: stream ending without finish_reason → 'pending'", async () => {
  const openaiStreamSimple = await getStreamSimple("./azure-openai-models.ts");
  // OpenAI SSE with content but no finish_reason on any chunk.
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ choices: [{ delta: { content: "partial..." }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: null }] }),
    // No finish_reason ever arrives — stream just ends.
  ]);
  const stream = await openaiStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "pending", `stream without finish_reason should be 'pending', got '${msg.stopReason}'`);
});

await check("azure-openai-models: tool_calls finish_reason → canonical 'toolUse'", async () => {
  const openaiStreamSimple = await getStreamSimple("./azure-openai-models.ts");
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
  ]);
  const stream = await openaiStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "toolUse", `tool_calls must map to 'toolUse', got '${msg.stopReason}'`);
});

await check("azure-openai-models: length finish_reason → canonical 'length'", async () => {
  const openaiStreamSimple = await getStreamSimple("./azure-openai-models.ts");
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] }),
  ]);
  const stream = await openaiStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "length", `length must map to 'length', got '${msg.stopReason}'`);
});

await check("azure-openai-models: unknown finish_reason passes through (not 'pending')", async () => {
  const openaiStreamSimple = await getStreamSimple("./azure-openai-models.ts");
  globalThis.fetch = async () => sseResponse([
    JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "insensitive_stream" }] }),
  ]);
  const stream = await openaiStreamSimple(MODEL, CONTEXT, {});
  for await (const _ of stream) { /* drain */ }
  const msg = await stream.result();
  assert.equal(msg.stopReason, "insensitive_stream", `unknown finish_reason must pass through, got '${msg.stopReason}'`);
});

// Restore network-disabled stub for any future checks.
globalThis.fetch = async () => { throw new Error("network disabled in test"); };

console.log(`\n${passed} checks passed`);
