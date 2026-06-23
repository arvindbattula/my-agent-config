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

// Required env vars read at module load.
process.env.AZURE_FOUNDRY_BASE_URL ??= "https://test.invalid/anthropic/v1";
process.env.AZURE_FOUNDRY_ARM_SUBSCRIPTION ??= "00000000-0000-0000-0000-000000000000";
process.env.AZURE_FOUNDRY_ARM_RESOURCE_GROUP ??= "test-rg";
process.env.AZURE_FOUNDRY_ARM_ACCOUNT ??= "test-account";
// Disable the in-extension retry loop so the network-disabled fetch fails fast.
// Prod default is 3 retries with 2s exponential backoff (~14s); tests don't need it.
process.env.AZURE_FOUNDRY_MAX_RETRIES ??= "0";
process.env.AZURE_FOUNDRY_RETRY_BASE_DELAY_MS ??= "0";

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

await check("azure-foundry retry loop: 529 retried MAX_RETRIES+1 times, one error event", async () => {
  // Allow 2 retries (3 total attempts) with zero delay so we can assert the count.
  const prevMax = process.env.AZURE_FOUNDRY_MAX_RETRIES;
  process.env.AZURE_FOUNDRY_MAX_RETRIES = "2";
  fetchCalls = 0;
  globalThis.fetch = stubTransientFetch(
    529,
    JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
  );
  try {
    const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
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
    process.env.AZURE_FOUNDRY_MAX_RETRIES = prevMax ?? "0";
  }
});

await check("azure-foundry retry loop: non-transient 400 does NOT retry", async () => {
  const prevMax = process.env.AZURE_FOUNDRY_MAX_RETRIES;
  process.env.AZURE_FOUNDRY_MAX_RETRIES = "3";
  fetchCalls = 0;
  globalThis.fetch = stubTransientFetch(400, '{"error":"bad request"}');
  try {
    const stream = await foundryStreamSimple(MODEL, CONTEXT, {});
    for await (const _ of stream) { /* drain */ }
    assert.equal(fetchCalls, 1, "non-transient status must not retry");
    const msg = await stream.result();
    assert.match(msg.errorMessage, /^400 /);
  } finally {
    process.env.AZURE_FOUNDRY_MAX_RETRIES = prevMax ?? "0";
  }
});

// Restore network-disabled stub for any future checks.
globalThis.fetch = async () => { throw new Error("network disabled in test"); };

console.log(`\n${passed} checks passed`);
