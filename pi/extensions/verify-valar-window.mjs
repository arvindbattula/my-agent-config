#!/usr/bin/env node
/**
 * verify-valar-window.mjs
 *
 * Smoke test for the valar-completion-window extension (run: `node pi/extensions/verify-valar-window.mjs`).
 *
 * Part 1 (offline, no network): loads ./valar-completion-window.ts directly, registers
 * its before_provider_request handler against a stub ExtensionAPI, and asserts the
 * merge/validate logic: default window, env override, normalization, metadata merge
 * (never clobbers), flex/invalid rejection, non-Valar pass-through.
 *
 * Part 2 (live): posts to Valar's Chat Completions API with $VALAR_API_KEY and asserts
 * metadata.completion_window is accepted on non-streaming and streaming requests —
 * the acceptance risk that motivated this extension (Valar's strict schema rejects
 * unknown fields, e.g. the top-level `reasoning` it itself emits).
 *
 * Exit 0 only if every assertion passes. Node >= 23.6 (type stripping) required.
 */

import assert from "node:assert/strict";

const API = "https://api.valarhq.ai/v1/chat/completions";
const MODEL = "zai-org/GLM-5.3";
const KEY = process.env.VALAR_API_KEY;

// ── Part 1: extension logic (offline) ────────────────────────────────────────
const handlers = {};
const ext = await import("./valar-completion-window.ts");
ext.default({ on: (event, fn) => (handlers[event] = fn) });
const hook = handlers.before_provider_request;
assert.equal(typeof hook, "function", "extension registers before_provider_request");

const valarCtx = { model: { provider: "valar", baseUrl: "https://api.valarhq.ai/v1" } };
const azureCtx = { model: { provider: "azure", baseUrl: "https://example.openai.azure.com" } };

function hookWith(env, payload, ctx = valarCtx) {
	delete process.env.VALAR_COMPLETION_WINDOW;
	if (env !== undefined) process.env.VALAR_COMPLETION_WINDOW = env;
	return hook({ payload }, ctx);
}

// default window = standard
assert.deepEqual(hookWith(undefined, { messages: [] }).metadata, { completion_window: "standard" });
// env override, trimmed + case-insensitive
assert.equal(hookWith(" priority ", { messages: [] }).metadata.completion_window, "priority");
assert.equal(hookWith("ASAP", { messages: [] }).metadata.completion_window, "asap");
// merge, never overwrite
assert.deepEqual(
	hookWith("standard", { messages: [], metadata: { completion_webhook: "https://example/hook" } }).metadata,
	{ completion_webhook: "https://example/hook", completion_window: "standard" },
);
// flex: background-only, must be refused
assert.equal(hookWith("flex", { messages: [] }), undefined);
// invalid value: refused, keep Valar default (Now)
assert.equal(hookWith("banana", { messages: [] }), undefined);
// non-Valar provider and non-chat payloads untouched
assert.equal(hookWith("standard", { messages: [] }, azureCtx), undefined);
assert.equal(hookWith("standard", { input: "responses-shaped" }), undefined);
// slight mutation-safety: original payload object is the same instance returned
const payload = { messages: [] };
assert.equal(hookWith("standard", payload), payload);

console.log("part 1 (offline logic): PASS");

// ── Part 2: live API acceptance ──────────────────────────────────────────────
if (!KEY) {
	console.error("part 2 (live API): SKIPPED — VALAR_API_KEY not set");
	console.error("smoke cannot pass without the live part");
	process.exit(1);
}

const base = {
	model: MODEL,
	messages: [{ role: "user", content: "Reply with exactly: ok" }],
	max_completion_tokens: 3000,
	metadata: { completion_window: "standard" },
};

// A) non-streaming
const a = await fetch(API, {
	method: "POST",
	headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
	body: JSON.stringify(base),
});
const aBody = await a.json();
assert.equal(a.status, 200, `non-streaming accepted (got ${a.status}: ${JSON.stringify(aBody.error ?? "")})`);
assert.ok(["stop", "tool_calls"].includes(aBody.choices?.[0]?.finish_reason), "non-streaming finish_reason");
assert.ok(aBody.usage?.total_tokens > 0, "non-streaming usage reported");
console.log("part 2 (live): non-streaming + standard — PASS");

// B) streaming (SSE + closing usage chunk)
const b = await fetch(API, {
	method: "POST",
	headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
	body: JSON.stringify({ ...base, stream: true, stream_options: { include_usage: true } }),
});
assert.equal(b.status, 200, `streaming accepted (got ${b.status})`);
const sse = await b.text();
assert.ok(sse.includes('"object":"chat.completion.chunk"'), "SSE chunks returned");
assert.ok(/"finish_reason":"(stop|tool_calls)"/.test(sse), "stream finish_reason");
assert.ok(/"usage":\{/.test(sse), "closing usage chunk");
console.log("part 2 (live): streaming + standard — PASS");

console.log("verify-valar-window: ALL PASS");
