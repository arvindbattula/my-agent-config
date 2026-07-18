/**
 * Lifecycle Guards Extension for Pi.
 *
 * Ports the Claude Code bash hooks to Pi's extension event system so the same
 * deterministic rules run in both runtimes:
 *
 * - session_start + before_agent_start → session context (session-start.sh)
 * - tool_call (write/edit) → protected paths (protect-paths.sh)
 * - tool_call (bash) → command policy (command-policy.sh)
 * - tool_result (write) → memory compression (compress-memory.sh)
 * - tool_result (write/edit) → design antipattern check + gate state (design-antipattern-check.sh)
 * - agent_end → completion gate (stop-gate.sh)
 * - session_shutdown → audit record (session-end.sh)
 *
 * State files (per-project, gitignored):
 * - .hook-state/last_design_gate.json — written by tool_result for observability/
 *   parity with the bash hooks. The agent_end nudge decision uses in-memory
 *   session state (see failingFiles below), so a stale file from a previous
 *   session can never hard-block a fresh one.
 * - reports/session-audit.log — appended by session_shutdown
 *
 * Interaction with plan-mode extension:
 * Both extensions listen to tool_call. Plan-mode returns early when !planModeEnabled,
 * so there's no conflict when plan mode is off. When plan mode is on, both handlers
 * run — if either blocks, the tool is blocked. Our command policy is a subset of
 * plan-mode's restrictions, so plan-mode's stricter checks will block first.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import {
	isProtectedPath,
	checkCommand,
	checkDesignPatterns,
	compressFileContent,
	validateCompression,
	isFrontendFile,
	isMemoryFile,
	SESSION_CONTEXT,
	type DesignGateState,
} from "./utils.ts";

export default function lifecycleGuardsExtension(pi: ExtensionAPI): void {
	// Design gate state — in-memory, so it is naturally scoped to this session
	// (the extension instance is re-created on new/resume/fork). Each frontend
	// file is tracked independently so fixing one file does not mask another that
	// is still failing. The circuit breaker prevents infinite gate→nudge loops and
	// re-arms when the set of failing files changes (i.e. real progress is made).
	const failingFiles = new Map<string, string[]>();
	let gateFollowUpCount = 0;
	const MAX_GATE_FOLLOW_UPS = 3;
	let lastGateSignature = "";

	// ─── Session context (ports session-start.sh) ──────────────────────────

	pi.on("before_agent_start", async () => {
		return {
			message: {
				customType: "lifecycle-guards-context",
				content: SESSION_CONTEXT,
				display: false,
			},
		};
	});

	// ─── Protected paths + command policy (ports protect-paths.sh + command-policy.sh) ────

	pi.on("tool_call", async (event, ctx) => {
		// Protected paths: write/edit tools
		if (event.toolName === "write" || event.toolName === "edit") {
			const input = event.input as { file_path?: string };
			const filePath = input.file_path;
			if (!filePath) return;

			const result = isProtectedPath(filePath, ctx.cwd);
			if (result.blocked) {
				if (ctx.hasUI) {
					ctx.ui.notify(`⏸ Blocked: ${result.reason}`, "warning");
				}
				return {
					block: true,
					reason: result.reason,
				};
			}
		}

		// Command policy: bash tool
		if (event.toolName === "bash") {
			const input = event.input as { command?: string };
			const command = input.command;
			if (!command) return;

			const result = checkCommand(command);
			if (result.blocked) {
				if (ctx.hasUI) {
					ctx.ui.notify(`⏸ ${result.reason}`, "warning");
				}
				return {
					block: true,
					reason: result.reason,
				};
			}
		}
	});

	// ─── Memory compression + design antipattern check (ports compress-memory.sh + design-antipattern-check.sh) ────

	pi.on("tool_result", async (event, ctx) => {
		const input = event.input as { file_path?: string };
		const filePath = input.file_path;
		if (!filePath) return;

		// Only process write and edit tool results
		if (event.toolName !== "write" && event.toolName !== "edit") return;

		// Memory compression: only for write tool on memory/*.md files
		if (event.toolName === "write" && isMemoryFile(filePath)) {
			try {
				compressMemoryFile(filePath);
			} catch {
				// Never interfere with the tool result on compression error
			}
		}

		// Design antipattern check: for write/edit on frontend files
		if (isFrontendFile(filePath)) {
			try {
				const warnings = checkDesignPatternsForFile(filePath, ctx.cwd);

				// Track this file independently: record when failing, clear when clean
				if (warnings.length > 0) {
					failingFiles.set(filePath, warnings);
				} else {
					failingFiles.delete(filePath);
				}
				writeGateState(ctx.cwd, failingFiles);

				// Show TUI notification and append warnings to tool result content
				if (warnings.length > 0 && ctx.hasUI) {
					ctx.ui.notify(`⚠ Design: ${warnings.length} anti-pattern(s) detected in ${filePath}`, "warning");
				}

				if (warnings.length > 0) {
					// Append warnings to the tool result content so the model sees them
					const warningText = warnings.map((w) => ({ type: "text" as const, text: w }));
					return {
						content: [...event.content, ...warningText],
					};
				}
			} catch {
				// Never interfere with the tool result on check error
			}
		}
	});

	// ─── Completion gate (ports stop-gate.sh) ──────────────────────────────

	pi.on("agent_end", async () => {
		try {
			if (failingFiles.size === 0) return;

			// Re-arm the breaker when the set of failing files changes (progress made)
			const signature = [...failingFiles.keys()].sort().join("\n");
			if (signature !== lastGateSignature) {
				gateFollowUpCount = 0;
				lastGateSignature = signature;
			}

			if (gateFollowUpCount >= MAX_GATE_FOLLOW_UPS) return;
			gateFollowUpCount++;

			const files = [...failingFiles.keys()].map((f) => `- ${f}`).join("\n");
			pi.sendUserMessage(
				`Design quality gate failed. Fix the anti-patterns in these files before finishing:\n${files}`,
				{ deliverAs: "followUp" },
			);
		} catch {
			// Fail open — don't block completion on errors
		}
	});

	// ─── Audit record (ports session-end.sh) ───────────────────────────────

	pi.on("session_shutdown", async (event, ctx) => {
		try {
			const reportsDir = join(ctx.cwd, "reports");
			mkdirSync(reportsDir, { recursive: true });

			const record = {
				timestamp: new Date().toISOString(),
				event: "session_shutdown",
				reason: (event as { reason?: string }).reason ?? "unknown",
				cwd: ctx.cwd,
			};

			const logPath = join(reportsDir, "session-audit.log");
			writeFileSync(logPath, JSON.stringify(record) + "\n", { flag: "a" });
		} catch {
			// Never interfere with session teardown
		}
	});

	// ─── Helper functions ──────────────────────────────────────────────────

	function compressMemoryFile(filePath: string): void {
		if (!existsSync(filePath)) return;

		const original = readFileSync(filePath, "utf-8");
		if (!original.trim()) return;

		const compressed = compressFileContent(original);
		if (compressed === original) return;

		const error = validateCompression(original, compressed);
		if (error) return; // Don't write if validation failed

		writeFileSync(filePath, compressed);
	}

	function checkDesignPatternsForFile(filePath: string, cwd: string): string[] {
		// Resolve path
		const absPath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
		if (!existsSync(absPath)) return [];

		const content = readFileSync(absPath, "utf-8");
		return checkDesignPatterns(content);
	}

	function writeGateState(cwd: string, failing: Map<string, string[]>): void {
		const stateDir = join(cwd, ".hook-state");
		mkdirSync(stateDir, { recursive: true });

		const state: DesignGateState = {
			failing_files: Object.fromEntries(failing),
		};

		writeFileSync(join(stateDir, "last_design_gate.json"), JSON.stringify(state, null, 2) + "\n");
	}
}
