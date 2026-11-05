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
ext.default({ on: (event, fn) => (handlers[event] = fn), registerCommand: () => {} });
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

// ── /valar command (offline) ──────────────────────────────────────────────
// The same extension registers the picker; a richer fake pi captures the
// command, and fake UI contexts drive every path.
const commands = {};
let fakeLevel = "high";
const cmdPi = {
	on: (event, fn) => (handlers[event] = fn),
	registerCommand: (name, opts) => (commands[name] = opts),
	setThinkingLevel: (l) => (fakeLevel = l),
	getThinkingLevel: () => fakeLevel,
};
ext.default(cmdPi);
assert.equal(typeof commands.valar?.handler, "function", "command /valar registered");
assert.equal(typeof commands.valar.getArgumentCompletions, "function", "completions registered");

function makeCtx({ ui = true, thinkingLevel = "high", provider = "valar", waitForIdle = false } = {}) {
	const ctx = { model: { provider }, thinkingLevel, selectCalls: [], selectQueue: [], notifications: [] };
	if (waitForIdle) ctx.waitForIdle = async () => {};
	if (ui) {
		ctx.ui = {
			select: async (title, items) => {
				ctx.selectCalls.push([title, items]);
				return ctx.selectQueue.length ? ctx.selectQueue.shift() : undefined;
			},
			notify: (message, level) => ctx.notifications.push([level, message]),
			};
	}
	return ctx;
}
const env = () => process.env.VALAR_COMPLETION_WINDOW;
const runArgs = async (args, ctxOpts) => {
	const ctx = makeCtx(ctxOpts);
	await commands.valar.handler(args, ctx);
	return ctx;
};

// arg form: window + level together, in either order
{
	delete process.env.VALAR_COMPLETION_WINDOW;
	const ctx = await runArgs("priority high", {});
	assert.equal(env(), "priority", "arg form sets env window");
	assert.equal(fakeLevel, "high", "arg form sets thinking level");
	assert.ok(ctx.notifications.some(([, m]) => m.includes("Priority")), "window notify");
	assert.ok(ctx.notifications.some(([, m]) => m.includes("Thinking level → high")), "level notify");
}
{
	process.env.VALAR_COMPLETION_WINDOW = "priority";
	await runArgs("xhigh standard", {}); // level first, window second — independent classification
	assert.equal(env(), "standard", "window token applied");
	assert.equal(fakeLevel, "xhigh", "level token applied");
}
// aliases: now→asap, none→off
{
	await runArgs("now", {});
	assert.equal(env(), "asap", '"now" aliases to asap');
	await runArgs("none", {});
	assert.equal(fakeLevel, "off", '"none" aliases to off');
}
// flex and junk refused with error notifies, state untouched where claimed
{
	delete process.env.VALAR_COMPLETION_WINDOW;
	const ctx = await runArgs("flex", {});
	assert.equal(env(), undefined, "flex refused, env unset");
	assert.ok(ctx.notifications.some(([l]) => l === "error"), "flex error notify");
}
{
	delete process.env.VALAR_COMPLETION_WINDOW;
	const ctx = await runArgs("banana high", {});
	assert.equal(env(), undefined, "junk window ignored");
	assert.equal(fakeLevel, "high", "valid level after junk still applies");
	assert.ok(
		ctx.notifications.some(([l, m]) => l === "error" && m.includes('"banana"')),
		"junk token error notify",
	);
}
// picking the current window is a no-op with a friendly notify
{
	process.env.VALAR_COMPLETION_WINDOW = "standard";
	const ctx = await runArgs("standard", {});
	assert.equal(env(), "standard");
	assert.ok(ctx.notifications.some(([, m]) => m.includes("stays Standard")), "no-op notify");
}
// interactive: both selects driven by the queue; current value pre-marked
{
	delete process.env.VALAR_COMPLETION_WINDOW;
	const ctx = makeCtx({});
	ctx.selectQueue.push("Priority — ~10 s ceiling, ~25% cheaper than Now");
	ctx.selectQueue.push("medium");
	await commands.valar.handler("", ctx);
	assert.equal(env(), "priority", "interactive window pick");
	assert.equal(fakeLevel, "medium", "interactive level pick");
	assert.ok(ctx.selectCalls[0][1].some((i) => i.includes("← current")), "window list marks current");
	assert.equal(ctx.selectCalls.length, 2, "two prompts offered");
}
// Esc (undefined) on the window step still offers the thinking step
{
	delete process.env.VALAR_COMPLETION_WINDOW;
	const ctx = makeCtx({});
	ctx.selectQueue.push(undefined);
	ctx.selectQueue.push("low");
	await commands.valar.handler("", ctx);
	assert.equal(env(), undefined, "Esc skips window without changing it");
	assert.equal(fakeLevel, "low", "thinking step runs after Esc on window");
}
// Esc on both steps changes nothing
{
	process.env.VALAR_COMPLETION_WINDOW = "standard";
	const ctx = makeCtx({});
	await commands.valar.handler("", ctx);
	assert.equal(env(), "standard");
}
// headless (no ctx.ui.select): no args → guidance error, no crash
{
	delete process.env.VALAR_COMPLETION_WINDOW;
	const ctx = makeCtx({ ui: false });
	// ui absent entirely: handler must not throw, and nothing can be recorded
	await commands.valar.handler("", ctx);
	assert.equal(ctx.notifications.length, 0, "no crash, no notifications possible without ui");
}
{
	// with a notify-capable but select-less ui (headless RPC): argument-form guidance
	const ctx = makeCtx({ ui: false });
	// simulate a ui object that only has notify
	ctx.ui = { notify: (m, l) => ctx.notifications.push([l, m]) };
	await commands.valar.handler("", ctx);
	assert.ok(
		ctx.notifications.some(([, m]) => m.includes("/valar <window>")),
		"headless guidance notify",
	);
}
// non-Valar provider: window still set but scoped note appended
{
	delete process.env.VALAR_COMPLETION_WINDOW;
	const ctx = await runArgs("priority", { provider: "azure" });
	assert.equal(env(), "priority");
	assert.ok(
		ctx.notifications.some(([, m]) => m.includes("applies to Valar requests only")),
		"scope note for non-Valar provider",
	);
}
// completions: windows + levels by prefix; flex never offered
{
	const all = commands.valar.getArgumentCompletions("");
	assert.ok(all.some((i) => i.value === "priority") && all.some((i) => i.value === "high"));
	assert.ok(!all.some((i) => i.value === "flex"), "flex not offered");
	assert.equal(commands.valar.getArgumentCompletions("f"), null, 'prefix "f" → null (flex excluded)');
	assert.deepEqual(
		commands.valar.getArgumentCompletions("as").map((i) => i.value),
		["asap"],
		'prefix "as" → asap only',
	);
}
// command → hook chain: env set by the command is what the hook injects next request
{
	delete process.env.VALAR_COMPLETION_WINDOW;
	await runArgs("priority", {});
	const injected = handlers.before_provider_request(
		{ payload: { messages: [{ role: "user", content: "hi" }] } },
		{ model: { provider: "valar", baseUrl: "https://api.valarhq.ai/v1" } },
	);
	assert.equal(injected.metadata.completion_window, "priority", "hook follows command-set env");
}

delete process.env.VALAR_COMPLETION_WINDOW;
console.log("part 1 (offline logic + /valar command): PASS");

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
