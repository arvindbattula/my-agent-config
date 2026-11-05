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

/** Initialize (or switch) the sandbox policy. Returns success. When
 * `verifyCwd` is provided, a post-init enforcement canary verifies that a
 * wrapped command can actually run before declaring the sandbox ready
 * (see `sandboxEnforceCanary` below).
 */
export async function ensureSandbox(
	config: SandboxRuntimeConfig,
	key: string,
	verifyCwd?: string,
): Promise<boolean> {
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
		// Post-init enforcement canary (2026-11-05): "ready" must mean a
		// wrapped command can run, not just that the mux could listen. Two
		// documented states report a healthy init while every wrapped command
		// then fails, which bricks ALL plan/airgap bash instead of degrading:
		//   - macOS nested Seatbelt (agent-safehouse): the wrapped child runs
		//     `sandbox-exec -p <profile>`, and applying a profile from inside
		//     a Seatbelt sandbox is OS-blocked: "sandbox_apply: Operation not
		//     permitted", exit 71. NOT fixable with additional allow rules.
		//   - Linux blocked namespaces: init succeeds, every exec fails with
		//     a `bwrap:` error (README "Blocked namespaces look different from
		//     missing binaries").
		// The canary runs the exact production enforcement path with `true`
		// once per init (~100-200ms); on failure the sandbox is torn down
		// and this degrades identically to an init failure.
		if (verifyCwd !== undefined && existsSync(verifyCwd)) {
			const canary = await sandboxEnforceCanary(verifyCwd);
			if (canary !== true) {
				await teardownToError(
					`kernel sandbox initialized but cannot enforce commands: ${canary} — nested sandbox profile application is blocked in this environment (see plan-mode AUDIT.md "Safehouse coexistence")`,
				);
				return false;
			}
		}
		policyKey = key;
		initError = null;
		return true;
	} catch (e) {
		policyKey = null;
		initError = describeSandboxInitFailure(e instanceof Error ? e.message : String(e));
		return false;
	}
}

/** Shared failure path for a sandbox that initialized but cannot enforce. */
async function teardownToError(message: string): Promise<void> {
	policyKey = null;
	initError = message;
	try {
		await SandboxManager.reset();
	} catch {
		// the sandbox cannot enforce anyway; best-effort cleanup
	}
}

/** Run one wrapped `true` through the production bash ops and report
 * `true` when it exits 0, else the failing output's last line (or the
 * thrown error text). */
async function sandboxEnforceCanary(cwd: string): Promise<true | string> {
	let out = "";
	try {
		const ops = createSandboxedBashOps();
		const res = await ops.exec("true", cwd, {
			onData: (d) => (out += d.toString()),
			timeout: 10,
		});
		if (res.exitCode === 0) return true;
		const tail = out.trim().split("\n").pop() ?? "";
		return tail || `wrapped command exited ${res.exitCode}`;
	} catch (e) {
		const reason = e instanceof Error ? e.message : String(e);
		return reason || "wrapped command could not run";
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
