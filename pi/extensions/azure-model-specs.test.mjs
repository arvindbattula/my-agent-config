// Regression test: MODEL_SPECS parity with pi-ai's bundled anthropic.json catalog.
//
// Every entry in MODEL_SPECS must match the corresponding catalog entry for
// contextWindow, maxTokens, reasoning, cost (per-Mtok), thinkingLevelMap, and
// adaptive (forceAdaptiveThinking). This test stops the entire class of drift
// that caused claude-opus-5 to run without thinking, zero cost, and 1/5 context.
//
// Requires Node's native TypeScript type stripping (Node >= 23.6).
//
// Run: node pi/extensions/azure-model-specs.test.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { createRequire } from "node:module";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";

// Resolve extensionless relative imports inside the .ts extensions.
register("./ts-resolve-hook.mjs", import.meta.url);
const require = createRequire(import.meta.url);

// Required env vars read at module load time (azure-foundry.ts calls requireEnv
// at the top level).
process.env.AZURE_FOUNDRY_BASE_URL ??= "https://test.invalid/anthropic/v1";
process.env.AZURE_FOUNDRY_ARM_SUBSCRIPTION ??= "00000000-0000-0000-0000-000000000000";
process.env.AZURE_FOUNDRY_ARM_RESOURCE_GROUP ??= "test-rg";
process.env.AZURE_FOUNDRY_ARM_ACCOUNT ??= "test-account";

// Network off — we don't need ARM discovery for this test.
globalThis.fetch = async () => { throw new Error("network disabled in test"); };

const { MODEL_SPECS } = await import("./azure-foundry.ts");

// Locate pi-ai's bundled Anthropic catalog by resolving the `pi` binary symlink.
// The catalog is the authoritative source for model metadata; MODEL_SPECS must
// stay in sync with it.
function findCatalog() {
  const piBin = execSync("which pi", { encoding: "utf-8" }).trim();
  const cliPath = realpathSync(piBin);
  // dist/cli.js -> package root
  const pkgDir = dirname(dirname(cliPath));
  const catalogPath = resolve(
    pkgDir,
    "node_modules/@earendil-works/pi-ai/dist/providers/data/anthropic.json",
  );
  if (!existsSync(catalogPath)) {
    throw new Error(`Cannot find anthropic.json catalog at ${catalogPath}`);
  }
  return JSON.parse(readFileSync(catalogPath, "utf-8"))["anthropic-messages"];
}

const catalog = findCatalog();

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ok - ${name}`); };

// ── Every MODEL_SPECS entry must exist in the catalog ─────────────────────────

for (const id of Object.keys(MODEL_SPECS)) {
  check(`MODEL_SPECS["${id}"] exists in anthropic.json`, () => {
    assert.ok(catalog[id], `No catalog entry for "${id}" — MODEL_SPECS has a model pi doesn't know about`);
  });
}

// ── Field-by-field parity ─────────────────────────────────────────────────────

for (const [id, spec] of Object.entries(MODEL_SPECS)) {
  const cat = catalog[id];

  check(`"${id}" contextWindow matches`, () => {
    assert.equal(spec.contextWindow, cat.contextWindow,
      `contextWindow: ours=${spec.contextWindow} catalog=${cat.contextWindow}`);
  });

  check(`"${id}" maxTokens matches`, () => {
    assert.equal(spec.maxTokens, cat.maxTokens,
      `maxTokens: ours=${spec.maxTokens} catalog=${cat.maxTokens}`);
  });

  check(`"${id}" reasoning matches`, () => {
    assert.equal(spec.reasoning, cat.reasoning,
      `reasoning: ours=${spec.reasoning} catalog=${cat.reasoning}`);
  });

  check(`"${id}" cost matches (per-Mtok)`, () => {
    // Our costs are in $/token (divided by 1e6 via perM). Catalog costs are in $/Mtok.
    assert.equal(spec.cost.input, cat.cost.input / 1e6,
      `cost.input: ours=${spec.cost.input} catalog=${cat.cost.input / 1e6}`);
    assert.equal(spec.cost.output, cat.cost.output / 1e6,
      `cost.output: ours=${spec.cost.output} catalog=${cat.cost.output / 1e6}`);
    assert.equal(spec.cost.cacheRead, cat.cost.cacheRead / 1e6,
      `cost.cacheRead: ours=${spec.cost.cacheRead} catalog=${cat.cost.cacheRead / 1e6}`);
    assert.equal(spec.cost.cacheWrite, cat.cost.cacheWrite / 1e6,
      `cost.cacheWrite: ours=${spec.cost.cacheWrite} catalog=${cat.cost.cacheWrite / 1e6}`);
  });

  check(`"${id}" adaptive (forceAdaptiveThinking) matches`, () => {
    const ours = spec.adaptive ?? false;
    const theirs = cat.compat?.forceAdaptiveThinking ?? false;
    assert.equal(ours, theirs,
      `adaptive: ours=${ours} catalog=${theirs}`);
  });

  check(`"${id}" thinkingLevelMap matches`, () => {
    const ours = JSON.stringify(spec.thinkingLevelMap ?? undefined);
    const theirs = JSON.stringify(cat.thinkingLevelMap ?? undefined);
    assert.equal(ours, theirs,
      `thinkingLevelMap: ours=${ours} catalog=${theirs}`);
  });
}

// ── Critical models must be present ───────────────────────────────────────────

check("claude-opus-5 is present (default model)", () => {
  assert.ok(MODEL_SPECS["claude-opus-5"], "claude-opus-5 must be in MODEL_SPECS — it's the default model");
  assert.equal(MODEL_SPECS["claude-opus-5"].reasoning, true, "opus-5 must have reasoning: true");
  assert.equal(MODEL_SPECS["claude-opus-5"].contextWindow, 1000000, "opus-5 must have 1M context");
  assert.equal(MODEL_SPECS["claude-opus-5"].maxTokens, 128000, "opus-5 must have 128K maxTokens");
  assert.ok(MODEL_SPECS["claude-opus-5"].cost.input > 0, "opus-5 must have non-zero cost");
});

check("claude-sonnet-5 is present", () => {
  assert.ok(MODEL_SPECS["claude-sonnet-5"], "claude-sonnet-5 must be in MODEL_SPECS");
  assert.equal(MODEL_SPECS["claude-sonnet-5"].reasoning, true);
});

// ── opus-4-6 and sonnet-4-6 must NOT have xhigh ──────────────────────────────
// These models only support {max:"max"} — xhigh is not in their thinkingLevelMap.
// The old code set xhighEffort:"xhigh" on both, which was dead code (pi never
// offered xhigh) but also a documentation lie. Verify the map is correct.

check("claude-opus-4-6 thinkingLevelMap has no xhigh (only max)", () => {
  const map = MODEL_SPECS["claude-opus-4-6"].thinkingLevelMap;
  assert.ok(map, "opus-4-6 should have a thinkingLevelMap");
  assert.equal(map.xhigh, undefined, "opus-4-6 does not support xhigh");
  assert.equal(map.max, "max", "opus-4-6 supports max");
});

check("claude-sonnet-4-6 thinkingLevelMap has no xhigh (only max)", () => {
  const map = MODEL_SPECS["claude-sonnet-4-6"].thinkingLevelMap;
  assert.ok(map, "sonnet-4-6 should have a thinkingLevelMap");
  assert.equal(map.xhigh, undefined, "sonnet-4-6 does not support xhigh");
  assert.equal(map.max, "max", "sonnet-4-6 supports max");
});

// ── fable-5 must have off:null (cannot disable thinking) ─────────────────────

check("claude-fable-5 thinkingLevelMap has off:null", () => {
  const map = MODEL_SPECS["claude-fable-5"].thinkingLevelMap;
  assert.ok(map, "fable-5 should have a thinkingLevelMap");
  assert.equal(map.off, null, "fable-5 cannot disable thinking (off:null)");
});

console.log(`\n${passed} checks passed`);
