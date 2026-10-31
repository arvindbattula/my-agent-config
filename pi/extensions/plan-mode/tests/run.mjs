#!/usr/bin/env node
/**
 * Red-team corpus runner for the plan-mode extension (Phase 0).
 *
 * Modes:
 *   node run.mjs                  — GATE mode: observed behavior vs post-Phase-1
 *                                  targets. Exits 1 on any mismatch.
 *   node run.mjs --sandbox        — kernel sandbox probes. Exits 1 if any probe fails.
 *   node run.mjs --snapshot       — record observed behavior to baseline-1.4.0.json
 *                                  (the pre-change snapshot; discharges the "re-run
 *                                  redteam" requirement).
 *   node run.mjs --verify-baseline — compare observed behavior against the snapshot
 *                                  (drift detection after any code change).
 *
 * Requires node >= 22.6 (type stripping; node 24 runs it natively).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { airgapBlockReason, blockReason } from "../utils.ts";
import { CORPUS } from "./corpus.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, "baseline-1.4.0.json");

function tiers(entry) {
	if (entry.mode === "plan") return ["plan"];
	if (entry.mode === "airgap") return ["airgap"];
	return ["plan", "airgap"];
}

function observedFor(entry, tier) {
	const reason = tier === "airgap" ? airgapBlockReason(entry.command) : blockReason(entry.command);
	return reason === null ? "allow" : "block";
}

function run() {
	const rows = [];
	for (const entry of CORPUS) {
		for (const tier of tiers(entry)) {
			const observed = observedFor(entry, tier);
			const status =
				observed === entry.target ? "ok" : observed === "allow" ? "HOLE" : "FP";
			rows.push({ id: entry.id, tier, command: entry.command, target: entry.target, observed, status, severity: entry.severity, category: entry.category, note: entry.note ?? "" });
		}
	}
	return rows;
}

const args = process.argv.slice(2);

if (args.includes("--snapshot")) {
	const rows = run();
	const snapshot = {
		taken: new Date().toISOString(),
		pi: "1.4.0 (managed install)",
		note: "Observed behavior of blockReason/airgapBlockReason on the pre-Phase-1 extension.",
		rows,
	};
	writeFileSync(BASELINE_PATH, JSON.stringify(snapshot, null, "\t") + "\n");
	console.log(`Snapshot written to ${BASELINE_PATH} (${rows.length} tier-runs).`);
}

if (args.includes("--verify-baseline")) {
	const snapshot = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
	const rows = run();
	const prev = new Map(snapshot.rows.map((r) => [`${r.id}:${r.tier}`, r.observed]));
	const drift = [];
	for (const r of rows) {
		const before = prev.get(`${r.id}:${r.tier}`);
		if (before !== undefined && before !== r.observed) {
			drift.push(`${r.id} (${r.tier}): ${before} -> ${r.observed}  ${r.command}`);
		}
	}
	if (drift.length) {
		console.log(`DRIFT vs baseline (${drift.length}):\n` + drift.join("\n"));
		process.exit(1);
	}
	console.log(`No drift vs baseline (${rows.length} tier-runs match).`);
	process.exit(0);
}

if (args.includes("--sandbox")) {
	// Tier 3: kernel probes. The bypass vectors below are sent DIRECTLY through
	// the sandboxed operations, deliberately bypassing the regex layer — this
	// tier proves the OS boundary, not the word list. Requires the npm dep
	// (installed in Phase 2) and macOS Seatbelt / Linux bubblewrap.
	const {
		AIRGAP_DENY_READ,
		createSandboxedBashOps,
		ensureSandbox,
		planSandboxConfig,
		teardownSandbox,
	} = await import("../sandbox.ts");
	const { spawnSync } = await import("node:child_process");
	const { rmSync, statSync } = await import("node:fs");

	const OPS = createSandboxedBashOps();
	const CWD = new URL("../", import.meta.url).pathname;
	const results = [];
	const check = (id, label, pass, detail = "") => {
		results.push({ id, label, pass, detail });
		console.log(`${pass ? "PASS" : "FAIL"} ${id} ${label}${detail ? ` — ${detail}` : ""}`);
	};
	const skip = (id, label, why) => {
		results.push({ id, label, skipped: true });
		console.log(`SKIP ${id} ${label} — ${why}`);
	};
	// A denial only means something if the sandbox can run commands at all:
	// when bwrap cannot start, every command fails and denial probes pass.
	const notRun = (ids) => {
		for (const [id, label] of ids) check(id, label, false, "not run: sandbox cannot execute commands");
	};
	async function probe(cmd, cwd = CWD) {
		let out = "";
		try {
			const res = await OPS.exec(cmd, cwd, { onData: (d) => (out += d.toString()) });
			return { code: res.exitCode, out };
		} catch (e) {
			return { code: null, out, threw: e instanceof Error ? e.message : String(e) };
		}
	}
	const denied = (id, label, p, pass) => {
		check(id, label, !p.threw && pass, p.threw ? `probe threw: ${p.threw}` : `exit=${p.code}`);
	};
	const readableUnsandboxed = (path) => spawnSync("bash", ["-c", `test -r ${path}`]).status === 0;
	const fileExists = (p) => { try { statSync(p); return true; } catch { return false; } };
	const rm = (p) => { try { rmSync(p, { force: true }); } catch {} };

	// ── plan-mode policy ──
	const planOk = await ensureSandbox(planSandboxConfig([]), "plan");
	check("S-00", "sandbox initializes (plan policy)", planOk);
	if (planOk) {
		const p2 = await probe("cat package.json > /dev/null && echo READ_OK");
		const live = !p2.threw && p2.out.includes("READ_OK");
		check("S-02", "read allowed", live, p2.threw ? `probe threw: ${p2.threw}` : `exit=${p2.code}`);

		if (!live) {
			notRun([
				["S-01", "write denied"],
				["S-03", "network denied"],
				["S-04", "bypass: sh -c write fails at kernel"],
				["S-05", "bypass: git --output write fails at kernel"],
				["S-06", "bypass: sort -o write fails at kernel"],
			]);
		} else {
			await rm("/tmp/pm_t3_write");
			const p1 = await probe("echo x > /tmp/pm_t3_write && echo WROTE");
			denied("S-01", "write denied", p1, !p1.out.includes("WROTE") && !fileExists("/tmp/pm_t3_write"));

			const netControl = spawnSync("bash", ["-c", "curl -s -m 5 -o /dev/null -w '%{http_code}' https://example.com"], { encoding: "utf8" });
			if (!netControl.stdout?.includes("200")) {
				skip("S-03", "network denied", "no network even unsandboxed (offline machine)");
			} else {
				const p3 = await probe("curl -s -m 5 -o /dev/null -w '%{http_code}' https://example.com");
				denied("S-03", "network denied", p3, !p3.out.includes("200"));
			}

			// Bypass vectors — regex is deliberately NOT consulted here:
			await rm("/tmp/pm_t3_bypass");
			const p4 = await probe("sh -c 'echo pwned > /tmp/pm_t3_bypass'");
			denied("S-04", "bypass: sh -c write fails at kernel", p4, !fileExists("/tmp/pm_t3_bypass"));

			await rm("/tmp/pm_t3_gitout");
			await rm("/tmp/pm_t3_sorted");
			const tmpGit = "/tmp/pm_t3_repo";
			const hasGit = spawnSync("git", ["--version"]).status === 0;
			spawnSync("bash", ["-c", `rm -rf ${tmpGit} && mkdir -p ${tmpGit} && cd ${tmpGit} && echo a > f.txt`]);
			if (hasGit) {
				spawnSync("bash", ["-c", `cd ${tmpGit} && git init -q . && git add f.txt && git -c user.email=t@t -c user.name=t commit -qm x && echo b > f.txt`]);
			}

			// S-02 proved CWD only. These two run in a different directory.
			const repoRead = await probe("cat f.txt > /dev/null && echo READ_OK", tmpGit);
			const repoLive = !repoRead.threw && repoRead.out.includes("READ_OK");
			if (!hasGit) {
				skip("S-05", "bypass: git --output write fails at kernel", "git not installed");
			} else {
				const gitRead = await probe("git rev-parse HEAD > /dev/null && echo READ_OK", tmpGit);
				if (repoLive && gitRead.out.includes("READ_OK")) {
					const p5 = await probe("git diff --output=/tmp/pm_t3_gitout HEAD", tmpGit);
					denied("S-05", "bypass: git --output write fails at kernel", p5, !fileExists("/tmp/pm_t3_gitout"));
				} else {
					notRun([["S-05", "bypass: git --output write fails at kernel"]]);
				}
			}

			if (repoLive) {
				const p6 = await probe("sort -o /tmp/pm_t3_sorted f.txt", tmpGit);
				denied("S-06", "bypass: sort -o write fails at kernel", p6, !fileExists("/tmp/pm_t3_sorted"));
			} else {
				notRun([["S-06", "bypass: sort -o write fails at kernel"]]);
			}
		}
	}

	// ── airgap policy (policy switch exercises reset+reinit) ──
	const airgapOk = await ensureSandbox(planSandboxConfig(AIRGAP_DENY_READ), "airgap");
	check("S-10", "sandbox policy switch to airgap", airgapOk);
	if (airgapOk) {
		const p7 = await probe("cat package.json > /dev/null && echo READ_OK");
		const airgapLive = !p7.threw && p7.out.includes("READ_OK");
		check("S-11", "airgap: normal read allowed", airgapLive, p7.threw ? `probe threw: ${p7.threw}` : `exit=${p7.code}`);
		if (!airgapLive) {
			notRun([
				["S-12", "airgap: ~/.ssh read DENIED"],
				["S-13", "airgap: ~/.aws read DENIED"],
			]);
		} else {
			if (readableUnsandboxed("~/.ssh/config")) {
				const p8 = await probe("cat ~/.ssh/config");
				denied("S-12", "airgap: ~/.ssh read DENIED", p8, p8.code !== 0);
			} else {
				skip("S-12", "airgap: ~/.ssh read DENIED", "~/.ssh/config absent, so a failed read proves nothing");
			}
			if (readableUnsandboxed("~/.aws/config")) {
				const p9 = await probe("cat ~/.aws/config");
				denied("S-13", "airgap: ~/.aws read DENIED", p9, p9.code !== 0);
			} else {
				skip("S-13", "airgap: ~/.aws read DENIED", "~/.aws/config absent, so a failed read proves nothing");
			}
		}
	}

	await teardownSandbox();
	spawnSync("bash", ["-c", "rm -rf /tmp/pm_t3_repo /tmp/pm_t3_write /tmp/pm_t3_bypass /tmp/pm_t3_gitout /tmp/pm_t3_sorted"]);
	const skipped = results.filter((r) => r.skipped).length;
	const failed = results.filter((r) => !r.skipped && !r.pass);
	console.log(`\nSandbox tier: ${results.length - skipped - failed.length} passed, ${skipped} skipped, ${failed.length} failed.`);
	process.exit(failed.length > 0 ? 1 : 0);
}

// Default: gate mode (observed vs post-Phase-1 target)
const rows = run();
const holes = rows.filter((r) => r.status === "HOLE");
const fps = rows.filter((r) => r.status === "FP");
const ok = rows.filter((r) => r.status === "ok");

console.log(`Corpus gate: ${ok.length}/${rows.length} tier-runs at post-Phase-1 target.`);
console.log(`  Holes (allowed but must block): ${holes.length}`);
console.log(`  False positives (blocked but must allow): ${fps.length}`);

for (const r of [...holes, ...fps]) {
	console.log(`  [${r.status}] ${r.id} (${r.tier}) ${r.command}  — ${r.category}${r.note ? ` (${r.note})` : ""}`);
}

// Comparability summary: the original redteam.mjs 28, plan tier only
const rt = rows.filter((r) => r.id.startsWith("RT-") && r.tier === "plan");
const rtAllowed = rt.filter((r) => r.observed === "allow").length;
console.log(`\nredteam-28 subset (plan tier): ${rtAllowed}/${rt.length} allowed — redteam-results.md recorded 22/28.`);

process.exit(holes.length + fps.length > 0 ? 1 : 0);
