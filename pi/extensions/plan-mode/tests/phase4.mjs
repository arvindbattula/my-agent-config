#!/usr/bin/env node
/**
 * Phase 4 unit tests: trigger-assist heuristic. Hit → suggest; ambiguous or
 * direct → abstain; the handler gating (once-per-session, in-plan silence) is
 * wiring reviewed in code + manual no-spam check (AUDIT.md).
 */

import { endsTurnAfterBlock, shouldSuggestPlan } from "../utils.ts";

let failures = 0;
const check = (label, expected, actual) => {
	const pass = expected === actual;
	console.log(`${pass ? "PASS" : "FAIL"} ${label} (expected ${expected ? "suggest" : "abstain"}, got ${actual ? "suggest" : "abstain"})`);
	if (!pass) failures++;
};

// ── suggest (keyword hits) ──
// A blocked command must leave the model a chance to try something else, and
// repeats must stop rather than burn round-trips.
check("P4-B1 first block continues", false, endsTurnAfterBlock("npm test", null, 1));
check("P4-B2 repeated block ends the turn", true, endsTurnAfterBlock("npm test", "npm test", 2));
check("P4-B3 a different command continues", false, endsTurnAfterBlock("make", "npm test", 2));
check("P4-B4 alternating commands stop at the cap", true, endsTurnAfterBlock("make", "npm test", 3));

check("P4-01 refactor keyword", true, shouldSuggestPlan("Please refactor the authentication module to use the new token service"));
check("P4-02 migration keyword", true, shouldSuggestPlan("We need to migrate the whole API surface off REST and onto the new RPC layer"));
check("P4-03 multi-file phrase", true, shouldSuggestPlan("This change touches several files in the checkout flow, so please be careful with it"));
check("P4-04 architectural wording", true, shouldSuggestPlan("Redesign the data pipeline so it works across the repo without the legacy shim"));

// ── suggest (≥3 distinct file mentions, no keywords) ──
check(
	"P4-05 three files",
	true,
	shouldSuggestPlan("Update the imports in src/a.ts, src/b.ts, and src/c.ts to use the shared helper"),
);
check(
	"P4-06 two files only → abstain",
	false,
	shouldSuggestPlan("Update the imports in src/a.ts and src/b.ts to use the shared helper"),
);
check(
	"P4-07 same file three times counts once → abstain",
	false,
	shouldSuggestPlan("Check src/a.ts, then src/a.ts again, and also src/a.ts once more"),
);

// ── abstain (directness / short / ambiguous) ──
check("P4-08 short ask", false, shouldSuggestPlan("fix the typo in readme"));
check(
	"P4-09 'just' directness marker",
	false,
	shouldSuggestPlan("Just refactor the auth module quickly without making a big thing of it"),
);
check(
	"P4-10 'quick fix' marker",
	false,
	shouldSuggestPlan("Quick fix for the refactoring bug in the payment retry path, one-liner change"),
);
check(
	"P4-11 ambiguous, no signal",
	false,
	shouldSuggestPlan("Can you look into the thing we discussed yesterday with the deployment stuff"),
);
check("P4-12 question with keyword still suggests", true, shouldSuggestPlan("How should we approach refactoring the entire state management layer here?"));

console.log(`\nPhase 4 unit tests: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures > 0 ? 1 : 0);
