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
// Run: node pi/extensions/azure-stream-result.test.mjs

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

console.log(`\n${passed} checks passed`);
