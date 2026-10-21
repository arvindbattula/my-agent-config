// Regression test: statusline render() must not crash when the bundled
// pi-coding-agent's ExtensionAPI lacks getSettings().
//
// Background: statusline.ts called pi.getSettings() unguarded. That method
// only exists on the ExtensionAPI in pi-coding-agent >= 1.x. Feynman 0.3.48
// bundles exactly 0.84.2 (no getSettings), so every render() pass threw
// TypeError inside pi-tui's render timer callback -> uncaughtException ->
// "feynman exiting due to uncaughtException". Errors thrown from extension
// render() kill the whole process; they cannot be caught anywhere else.
//
// The guard now checks typeof pi.getSettings === "function" and falls back to
// the " (auto)" default (pi's default: compaction enabled) when settings are
// unavailable.
//
// Covers five cases:
//   1. getSettings absent (pi 0.84.x / feynman) — the crash regression
//   2. compaction.enabled === false — no " (auto)"
//   3. compaction.enabled === true — " (auto)"
//   4. compaction present, enabled unset — " (auto)" (default)
//   5. settings present, compaction absent — " (auto)" (default)
//
// Requires Node's native TypeScript type stripping (Node >= 23.6).
//
// Run: node pi/extensions/statusline.test.mjs

import assert from "node:assert/strict";
import { register } from "node:module";

// Alias "@earendil-works/pi-tui" and fix extensionless relative imports.
register("./statusline-test-hook.mjs", import.meta.url);

const { default: factory } = await import("./statusline.ts");
assert.equal(typeof factory, "function");

// --- Mocks mirroring the real render path: factory(pi) -> pi.on("session_start")
// -> ctx.ui.setFooter(footerFactory) -> footerFactory(tui, theme, footerData)
// -> component.render(width) -> string[].
const theme = { fg: (_color, text) => text };
const tui = { requestRender: () => {} };
const footerData = {
	getGitBranch: () => null,
	onBranchChange: () => () => {},
	getExtensionStatuses: () => new Map(),
};

async function renderWith(piMock) {
	const handlers = {};
	const pi = {
		on: (event, handler) => { handlers[event] = handler; },
		getThinkingLevel: () => "off",
		...piMock,
	};
	factory(pi);
	let footerFn = null;
	const ctx = {
		hasUI: true,
		cwd: process.cwd(),
		ui: { setFooter: (fn) => { footerFn = fn; } },
		sessionManager: {
			getEntries: () => [],
			getSessionId: () => "s1",
			getLeafId: () => "l1",
		},
		getContextUsage: () => ({ contextWindow: 200000, percent: 42.5 }),
		model: { name: "TestModel", provider: "p", id: "m", contextWindow: 200000 },
	};
	await handlers["session_start"]({}, ctx);
	assert.ok(footerFn, "setFooter was never called");
	const component = footerFn(tui, theme, footerData);
	return component.render(120);
}

// --- Case 1: regression — pi WITHOUT getSettings (feynman's bundled 0.84.2).
// This exact call chain crashed feynman before the guard.
{
	const lines = await renderWith({});
	assert.ok(Array.isArray(lines) && lines.length === 2, `render must return 2 lines, got ${lines}`);
	assert.match(lines[1], /\(auto\)/, "default must be (auto) when getSettings is unavailable");
}

// --- Cases 2-5: pi WITH getSettings — compaction variants.
{
	const cases = [
		[{ compaction: { enabled: false } }, false],
		[{ compaction: { enabled: true } }, true],
		[{ compaction: {} }, true],
		[{}, true],
	];
	for (const [settings, wantAuto] of cases) {
		const lines = await renderWith({ getSettings: () => settings });
		const hasAuto = lines[1].includes(" (auto)");
		assert.equal(
			hasAuto,
			wantAuto,
			`settings ${JSON.stringify(settings)}: expected ${wantAuto ? "" : "no "}"(auto)", got: ${lines[1]}`,
		);
	}
}

console.log("statusline.test.mjs: all 5 cases passed");
