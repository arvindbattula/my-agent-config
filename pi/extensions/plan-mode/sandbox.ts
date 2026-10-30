/**
 * Kernel-level bash sandboxing for plan/airgap modes — Phase 2.
 *
 * Wraps every bash command executed while plan mode (or airgap) is active in
 * @anthropic-ai/sandbox-runtime (Seatbelt on macOS, bubblewrap on Linux):
 * writes and network are denied at the OS level, regardless of how the
 * command is worded. The Phase 1 regex layer stays in front of this as
 * advisory UX (fast, specific block reasons) — THIS module is the boundary.
 *
 * Policies:
 *  - plan mode:  deny all writes, deny all network. `denyRead` is opt-in via
 *               a project-local `.pi/plan-mode.json` (`{ "denyRead": [...] }`).
 *  - airgap:     same, plus a FIXED denyRead list (~/.ssh, ~/.aws, ~/.gnupg,
 *               .env, *.pem, *.key) — owner decision (b), 2026-10-22.
 *
 * Empty-list semantics verified empirically on 0.0.81 / macOS 15.7.7
 * (see AUDIT.md "Phase 2"): `allowedDomains: []` + `allowWrite: []` ACCEPTED
 * and ENFORCED (write probe: "Operation not permitted"; egress probe fails
 * while an unsandboxed control gets 200). The CVE-2025-66479 empty-list
 * footgun did not reproduce on this version — and the credentials schemas
 * now reject explicitly-empty lists outright.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { SandboxManager, type SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { describeSandboxInitFailure, loadPlanModeConfig } from "./utils.ts";

/** Fixed airgap denyRead list — owner decision (b). Airgap is never configurable. */
export const AIRGAP_DENY_READ = ["~/.ssh", "~/.aws", "~/.gnupg", ".env", ".env.*", "*.pem", "*.key"];

/** Deny-all-writes + deny-all-network policy. denyRead is caller-supplied. */
export function planSandboxConfig(denyRead: string[]): SandboxRuntimeConfig {
	return {
		network: { allowedDomains: [], deniedDomains: [] },
		filesystem: { allowWrite: [], denyWrite: [], denyRead },
	};
}

/**
 * Project-local plan-mode denyRead (opt-in), delegated to the shared config
 * loader in utils.ts (`loadPlanModeConfig`). Airgap's list is FIXED and never
 * configurable — this only narrows plan-mode reads further.
 */
export function loadPlanDenyReadConfig(cwd: string): string[] {
	return loadPlanModeConfig(cwd).denyRead;
}

// ── lifecycle ──────────────────────────────────────────────────────────
// One SandboxManager policy is active at a time; `policyKey` tracks which
// ("plan" vs "airgap") so mode switches re-initialize exactly when needed.

let policyKey: string | null = null;
let initError: string | null = null;

/** True when a sandbox policy is initialized and healthy in this process. */
export function isSandboxReady(): boolean {
	return policyKey !== null && initError === null;
}

/** Last initialization failure, for notifications. Null when healthy. */
export function sandboxInitError(): string | null {
	return initError;
}

export function isSandboxPlatformSupported(): boolean {
	return process.platform === "darwin" || process.platform === "linux";
}

/** Initialize (or switch) the sandbox policy. Returns success. */
export async function ensureSandbox(config: SandboxRuntimeConfig, key: string): Promise<boolean> {
	if (policyKey === key && initError === null) return true;
	try {
		if (policyKey !== null) {
			try {
				await SandboxManager.reset();
			} catch {
				// best-effort teardown before switching policies
			}
		}
		await SandboxManager.initialize(config);
		policyKey = key;
		initError = null;
		return true;
	} catch (e) {
		policyKey = null;
		initError = describeSandboxInitFailure(e instanceof Error ? e.message : String(e));
		return false;
	}
}

/** Tear the sandbox down (mode exit / session shutdown). */
export async function teardownSandbox(): Promise<void> {
	if (policyKey === null) return;
	try {
		await SandboxManager.reset();
	} catch {
		// ignore cleanup errors
	}
	policyKey = null;
	initError = null;
}

// ── sandboxed bash operations ─────────────────────────────────────────
// Copied from the upstream sandbox example (verified byte-identical in the
// pi 0.84.2 AND 1.4.0 installs): spawn `bash -c <wrapped>` detached so the
// process group gets SIGKILLed on timeout/abort — preserving pi's built-in
// bash timeout semantics exactly.

export function createSandboxedBashOps(): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout }) {
			if (!existsSync(cwd)) {
				throw new Error(`Working directory does not exist: ${cwd}`);
			}

			const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

			return new Promise((resolve, reject) => {
				const child = spawn("bash", ["-c", wrappedCommand], {
					cwd,
					detached: true,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							try {
								process.kill(-child.pid, "SIGKILL");
							} catch {
								child.kill("SIGKILL");
							}
						}
					}, timeout * 1000);
				}

				child.stdout?.on("data", onData);
				child.stderr?.on("data", onData);

				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(err);
				});

				const onAbort = () => {
					if (child.pid) {
						try {
							process.kill(-child.pid, "SIGKILL");
						} catch {
							child.kill("SIGKILL");
						}
					}
				};

				signal?.addEventListener("abort", onAbort, { once: true });

				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					signal?.removeEventListener("abort", onAbort);

					if (signal?.aborted) {
						reject(new Error("aborted"));
					} else if (timedOut) {
						reject(new Error(`timeout:${timeout}`));
					} else {
						resolve({ exitCode: code });
					}
				});
			});
		},
	};
}
