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

import { describeSandboxInitFailure } from "../utils.ts";

let failures = 0;
const check = (label, pass, detail = "") => {
	console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!pass) failures++;
};

const HINT = "Linux prerequisites";

check("hint added: bwrap missing", describeSandboxInitFailure("Sandbox dependencies not available: bubblewrap (bwrap) not installed").includes(HINT));
check("hint added: socat missing", describeSandboxInitFailure("Sandbox dependencies not available: socat not installed").includes(HINT));
check("hint added: ripgrep missing", describeSandboxInitFailure("Sandbox dependencies not available: ripgrep (rg) not found").includes(HINT));

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
