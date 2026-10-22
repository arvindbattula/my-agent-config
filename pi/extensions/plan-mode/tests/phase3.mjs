#!/usr/bin/env node
/**
 * Phase 3 unit tests: step-check schema, extraction parsing, hash stability,
 * config loading. Plain script; exits non-zero on failure.
 * The plan_step_done gating itself (runCheck + cap) is integration-tested in
 * a live session (see AUDIT.md "Phase 3" — manual gate script).
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkHash, extractTodoItems, loadPlanModeConfig } from "../utils.ts";

let failures = 0;
const check = (label, pass, detail = "") => {
	console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!pass) failures++;
};

const plan = `Analysis here.

Plan:
1. Add splitSegments - done when: corpus gate passes [Verify: node tests/run.mjs] (files: utils.ts)
2. Add the messageType guard - done when: tsc is clean [Verify: npx tsc --noEmit -p /tmp/x.json] (files: index.ts)
3. Update docs - done when: AUDIT has the entry (files: AUDIT.md)

Risks:
- sed guard patterns are regex-fragile.`;

const items = extractTodoItems(plan);
check("P3-01 three steps extracted", items.length === 3, `got ${items.length}`);

const [s1, s2, s3] = items;
check(
	"P3-02 step 1 parses doneWhen",
	s1.doneWhen === "corpus gate passes",
	`got ${JSON.stringify(s1.doneWhen)}`,
);
check(
	"P3-03 step 1 parses Verify command",
	s1.check?.command === "node tests/run.mjs",
	`got ${JSON.stringify(s1.check?.command)}`,
);
check(
	"P3-04 step 1 parses files",
	s1.files === "utils.ts",
	`got ${JSON.stringify(s1.files)}`,
);
check(
	"P3-05 step 1 hash present & matches checkHash",
	s1.check?.hash === checkHash(1, "node tests/run.mjs"),
	`got ${s1.check?.hash}`,
);
check(
	"P3-06 display text is action-only (leading verb stripped by cleanStepText, suffixes gone)",
	s1.text === "SplitSegments",
	`got ${JSON.stringify(s1.text)}`,
);
check(
	"P3-07 rawText keeps full line",
	s1.rawText.includes("[Verify:") && s1.rawText.includes("(files:"),
	`got ${JSON.stringify(s1.rawText)}`,
);
check("P3-08 step 2 has check, step 3 has none", !!s2.check && !s3.check);
check("P3-09 unchecked step still has doneWhen", s3.doneWhen === "AUDIT has the entry");

// Determinism: same plan re-extracted → identical hashes (stable lock trail)
const items2 = extractTodoItems(plan);
check(
	"P3-10 hashes stable across extractions",
	items2.every((it, i) => it.check?.hash === items[i].check?.hash),
);

// Legacy plan format (no suffixes) still extracts unchanged
const legacy = extractTodoItems(`Plan:\n1. First step description\n2. Second step description`);
check(
	"P3-11 legacy format unaffected",
	legacy.length === 2 && legacy[0].text === "First step description" && !legacy[0].check && !legacy[0].doneWhen,
	`got ${JSON.stringify(legacy)}`,
);

// Config loader
const tmp = mkdtempSync(join(tmpdir(), "pm-p3-"));
try {
	check(
		"P3-12 default config when file missing",
		loadPlanModeConfig(tmp).verifySteps === true && loadPlanModeConfig(tmp).denyRead.length === 0,
	);
	mkdirSync(join(tmp, ".pi"), { recursive: true });
	writeFileSync(join(tmp, ".pi", "plan-mode.json"), JSON.stringify({ verifySteps: false, defaultCheck: "npm test", denyRead: ["~/.ssh"] }));
	const cfg = loadPlanModeConfig(tmp);
	check("P3-13 config read", cfg.verifySteps === false && cfg.defaultCheck === "npm test" && cfg.denyRead[0] === "~/.ssh");
	writeFileSync(join(tmp, ".pi", "plan-mode.json"), "{ invalid json");
	check(
		"P3-14 invalid JSON → safe defaults",
		loadPlanModeConfig(tmp).verifySteps === true && loadPlanModeConfig(tmp).denyRead.length === 0,
	);
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nPhase 3 unit tests: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures > 0 ? 1 : 0);
