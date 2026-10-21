// Regression test: statusline session-stat aggregation parity with pi's own
// usage-totals module (the code behind /stats and the built-in footer).
//
// computeSessionTotals must produce the same cost and token totals as
// pi's getUsageCostBreakdown summed across all groups, over a synthetic
// session that includes every usage-bearing entry type — especially the
// standalone `usage` entries (kind: "cache_warm") that the old
// assistant/toolResult-only aggregation missed (undercounting cost).
//
// Also covers formatTokens (ported from pi's footer) and sanitizeStatusText
// (control-char stripping so a misbehaving extension status cannot corrupt
// the footer layout).
//
// Requires Node's native TypeScript type stripping (Node >= 23.6).
//
// Run: node pi/extensions/session-stats.test.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { execSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve extensionless relative imports inside the .ts extensions.
register("./ts-resolve-hook.mjs", import.meta.url);

const { computeSessionTotals, formatTokens, sanitizeStatusText } = await import("./lib/session-stats.ts");

// Locate pi's installed dist (usage-totals.js) by resolving the `pi` binary
// symlink and walking up to the package root (the binary has moved between
// dist/cli.js and dist/bundle/cli.js across pi versions, so don't guess).
const piBin = execSync("which pi", { encoding: "utf-8" }).trim();
let pkgDir = dirname(realpathSync(piBin));
while (!existsSync(join(pkgDir, "package.json"))) {
	pkgDir = dirname(pkgDir);
}
const usageTotalsPath = join(pkgDir, "dist", "core", "usage-totals.js");
if (!existsSync(usageTotalsPath)) {
	throw new Error(`Cannot find pi's usage-totals.js at ${usageTotalsPath}`);
}
const { getUsageCostBreakdown } = await import(pathToFileURL(usageTotalsPath).href);

// --- Synthetic session: every usage-bearing entry type, plus noise. ---
const usage = (over = {}) => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	...over,
});

const session = [
	// Noise: no usage on these.
	{ type: "message", message: { role: "user", content: [{ type: "text", text: "hi" }] } },
	{ type: "custom" },
	// Assistant #1: cacheRead 8000 of a 9500-token prompt -> 84.2% hit rate,
	// but it is superseded by assistant #2 below.
	{
		type: "message",
		message: {
			role: "assistant",
			provider: "anthropic",
			model: "claude-x",
			usage: usage({
				input: 1000,
				output: 500,
				cacheRead: 8000,
				cacheWrite: 500,
				totalTokens: 10000,
				cost: { input: 0.003, output: 0.0075, cacheRead: 0.008, cacheWrite: 0.0005, total: 0.019 },
			}),
		},
	},
	// toolResult with usage.
	{
		type: "message",
		message: {
			role: "toolResult",
			usage: usage({ cacheRead: 2000, totalTokens: 2000, cost: { cacheRead: 0.002, total: 0.002 } }),
		},
	},
	// Standalone usage entry (cache warming) — the entry type the OLD
	// aggregation missed entirely. Carries real cost.
	{
		type: "usage",
		kind: "cache_warm",
		provider: "anthropic",
		model: "claude-x",
		usage: usage({
			cacheRead: 50000,
			totalTokens: 50000,
			cost: { cacheRead: 0.015, total: 0.015 },
		}),
	},
	// Compaction entry with usage (toolResult WITHOUT usage must be skipped).
	{ type: "message", message: { role: "toolResult", content: [] } },
	{ type: "compaction", usage: usage({ cacheWrite: 1000, totalTokens: 1000, cost: { cacheWrite: 0.001, total: 0.001 } }) },
	// branch_summary entry with usage.
	{ type: "branch_summary", usage: usage({ input: 100, totalTokens: 100, cost: { input: 0.0002, total: 0.0002 } }) },
	// Assistant #2 (latest): cacheRead 9000 of a 12000-token prompt -> 75%.
	{
		type: "message",
		message: {
			role: "assistant",
			provider: "anthropic",
			model: "claude-x",
			usage: usage({
				input: 2000,
				output: 300,
				cacheRead: 9000,
				cacheWrite: 1000,
				totalTokens: 12300,
				cost: { input: 0.006, output: 0.0045, cacheRead: 0.009, cacheWrite: 0.001, total: 0.05 },
			}),
		},
	},
];

// --- Aggregation parity vs pi's getUsageCostBreakdown (the /stats oracle). ---
const totals = computeSessionTotals(session);

const breakdown = getUsageCostBreakdown(session);
// Note: breakdown groups carry `cost` as a number (accumulated), not a
// { total } object — hence g.cost, not g.cost.total.
const oracleCost = breakdown.reduce((sum, g) => sum + g.cost, 0);
const oracleTokens = breakdown.reduce((sum, g) => sum + g.tokens, 0);

assert.ok(
	Math.abs(totals.cost - oracleCost) < 1e-12,
	`cost mismatch vs getUsageCostBreakdown: ${totals.cost} !== ${oracleCost}`
);
assert.equal(
	totals.input + totals.output + totals.cacheRead + totals.cacheWrite,
	oracleTokens,
	"token total mismatch vs getUsageCostBreakdown"
);

// --- Exact values (guards against accidental double counting). ---
assert.equal(totals.input, 3100);
assert.equal(totals.output, 800);
assert.equal(totals.cacheRead, 69000);
assert.equal(totals.cacheWrite, 2500);
assert.equal(totals.cost, 0.0872);

// cache_warm regression: the old aggregation (assistant/toolResult/
// compaction/branch_summary only) would have yielded 0.0722 here.
assert.ok(totals.cost > 0.085, `cache_warm usage entry not counted: cost=${totals.cost}`);

// Latest assistant entry wins the hit rate: 9000 / 12000 = 75%.
assert.equal(totals.cacheHitRate, 75);

// --- Edge cases: empty / no-usage sessions. ---
const empty = computeSessionTotals([]);
assert.deepEqual(empty, {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0,
	cacheHitRate: null,
});

// Assistant with a zero-token prompt leaves the hit rate null.
const zeroPrompt = computeSessionTotals([
	{ type: "message", message: { role: "assistant", usage: usage() } },
]);
assert.equal(zeroPrompt.cacheHitRate, null);
assert.equal(zeroPrompt.cost, 0);

// --- formatTokens (pi footer parity). ---
assert.equal(formatTokens(0), "0");
assert.equal(formatTokens(999), "999");
assert.equal(formatTokens(1000), "1.0k");
assert.equal(formatTokens(9999), "10.0k");
assert.equal(formatTokens(10000), "10k");
assert.equal(formatTokens(200000), "200k");
assert.equal(formatTokens(1500000), "1.5M");
assert.equal(formatTokens(25000000), "25M");

// --- sanitizeStatusText: control chars cannot break the footer layout. ---
assert.equal(sanitizeStatusText("line1\nline2"), "line1 line2");
assert.equal(sanitizeStatusText("a\r\nb\tc  d"), "a b c d");
assert.equal(sanitizeStatusText("  padded  "), "padded");
assert.equal(sanitizeStatusText(""), "");

console.log("session-stats.test.mjs: all assertions passed");
console.log(`  parity vs getUsageCostBreakdown: cost=$${oracleCost.toFixed(4)}, tokens=${oracleTokens}`);
console.log(`  totals: ↑${totals.input} ↓${totals.output} R${totals.cacheRead} W${totals.cacheWrite} CH${totals.cacheHitRate}%`);
