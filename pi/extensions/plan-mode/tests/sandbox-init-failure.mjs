#!/usr/bin/env node
/**
 * Linux missing-dependency failures must tell the user what to install, and
 * must leave the sandbox not-ready: index.ts blocks airgap bash on that state
 * (README "Fail-closed in airgap").
 *
 * The last check drives the real runtime through ensureSandbox rather than a
 * canned message. Spoofing process.platform + emptying PATH runs its genuine
 * Linux dependency check on any OS; it needs the npm dep installed.
 */

import { composeSandboxInitFailure, describeSandboxInitFailure } from "../utils.ts";

let failures = 0;
const check = (label, pass, detail = "") => {
	console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!pass) failures++;
};

const HINT = "Linux prerequisites";

check("hint added: bwrap missing", describeSandboxInitFailure("Sandbox dependencies not available: bubblewrap (bwrap) not installed").includes(HINT));
check("hint added: socat missing", describeSandboxInitFailure("Sandbox dependencies not available: socat not installed").includes(HINT));
check("hint added: ripgrep missing", describeSandboxInitFailure("Sandbox dependencies not available: ripgrep (rg) not found").includes(HINT));

// ── composeSandboxInitFailure (2026-11-05 UX hardening) ──────────────
// Both consequences must survive composition verbatim, and the safehouse
// explanations must key on APP_SANDBOX_CONTAINER_ID plus the two known
// failure signatures: mux bind (`listen EPERM`) and the enforcement canary
// (`sandbox_apply` / `cannot enforce commands` — nested Seatbelt is OS-blocked).
const EPERM = "listen EPERM: operation not permitted /var/folders/x/T/srt-mux-35759-1.sock";
const CANARY = "kernel sandbox initialized but cannot enforce commands: sandbox-exec: sandbox_apply: Operation not permitted — nested sandbox profile application is blocked in this environment (see plan-mode AUDIT.md \"Safehouse coexistence\")";
const safehouseMarker = process.env.APP_SANDBOX_CONTAINER_ID;
const E_FLAG = "APP_SANDBOX_CONTAINER_ID";
process.env[E_FLAG] = "agent-safehouse";
{
	const plan = composeSandboxInitFailure(EPERM, false);
	check("safehouse: plan consequence kept", plan.endsWith("Plan mode degrades to the regex guardrail."));
	check("safehouse: raw error kept", plan.includes(EPERM));
	check("safehouse: explains the mux-unable-to-listen cause", plan.includes("denies the Unix-socket binds the sandbox mux needs"));
	check("safehouse: marked expected", /expected inside agent-safehouse/.test(plan));
	check("safehouse: points at the README section", plan.includes('"Agent Safehouse (macOS wrapper)"'));
	const gap = composeSandboxInitFailure(EPERM, true);
	check("safehouse: airgap fail-closed kept", gap.includes("Airgap FAILS CLOSED: bash commands will be blocked until the sandbox initializes."));

	const canaryPlan = composeSandboxInitFailure(CANARY, false);
	check("canary: plan consequence kept", canaryPlan.endsWith("Plan mode degrades to the regex guardrail."));
	check("canary: explains nested-Seatbelt block", canaryPlan.includes("the OS blocks applying a nested Seatbelt profile"));
	check("canary: raw error kept", canaryPlan.includes("sandbox_apply: Operation not permitted"));
	check("canary: marked expected", /expected inside agent-safehouse/.test(canaryPlan));
	const canaryGap = composeSandboxInitFailure(CANARY, true);
	check("canary: airgap fail-closed kept", canaryGap.includes("Airgap FAILS CLOSED: bash commands will be blocked until the sandbox initializes."));
}
process.env[E_FLAG] = "some-other-wrapper";
check("any container id + known signature still explains",
	composeSandboxInitFailure(EPERM, false).includes("agent-safehouse"));
check("non-signature failure not blamed on safehouse",
	!composeSandboxInitFailure("ECONNREFUSED 127.0.0.1:1", false).includes("agent-safehouse"));
if (safehouseMarker === undefined) {
	delete process.env[E_FLAG];
	check("no env var: plain failure has no safehouse blame",
		!composeSandboxInitFailure(EPERM, false).includes("agent-safehouse"));
} else {
	process.env[E_FLAG] = safehouseMarker;
	check("env restored inside safehouse: blame still active",
		composeSandboxInitFailure(EPERM, false).includes("agent-safehouse"));
}

const unsupported = "Sandbox dependencies not available: Unsupported platform";
check("no install hint when packages would not help", describeSandboxInitFailure(unsupported) === unsupported);

const realPath = process.env.PATH;
const realPlatform = Object.getOwnPropertyDescriptor(process, "platform");
Object.defineProperty(process, "platform", { ...realPlatform, value: "linux" });
process.env.PATH = "";
const { ensureSandbox, isSandboxReady, planSandboxConfig, sandboxInitError } = await import("../sandbox.ts");
const ok = await ensureSandbox(planSandboxConfig([]), "airgap");
Object.defineProperty(process, "platform", realPlatform);
process.env.PATH = realPath;

const error = sandboxInitError() ?? "";
check("real runtime: init fails", ok === false);
check("real runtime: sandbox not ready, so airgap fails closed", isSandboxReady() === false);
for (const dep of ["bubblewrap", "socat", "ripgrep"]) check(`real runtime: names ${dep}`, error.split(" — ")[0].includes(dep), error);
check("real runtime: carries the install hint", error.includes(HINT));

process.exit(failures > 0 ? 1 : 0);
