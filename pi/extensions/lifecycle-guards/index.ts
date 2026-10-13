/**
 * Lifecycle Guards Extension for Pi.
 *
 * Two deterministic deny rules, ported from the Claude Code bash hooks:
 *
 * - tool_call (write/edit) → protected paths (protect-paths.sh)
 * - tool_call (bash)       → command policy (command-policy.sh)
 *
 * Pi has no native write-path or bash deny list; project trust does not
 * constrain tool calls (docs/security.md). These two handlers fill that gap
 * and stay silent until they fire.
 *
 * Interaction with the plan-mode extension:
 * Both listen to tool_call. Plan-mode returns early when !planModeEnabled, so
 * there is no conflict when plan mode is off. When plan mode is on, both
 * handlers run and either can block. Our command policy is a subset of
 * plan-mode's restrictions, so plan-mode blocks first.
 *
 * Removed 2026-10: session context injection (now ~/.pi/agent/AGENTS.md, which
 * Pi loads into the system prompt once per session instead of appending a
 * custom message to every run), design anti-pattern blocking (false-positive
 * prone; the design-review and design-polish skills cover it on demand),
 * memory compression (keyed on memory/*.md, which Pi never writes), and the
 * session audit log (duplicated Pi's own session files).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isProtectedPath, checkCommand } from "./utils.ts";

export default function lifecycleGuardsExtension(pi: ExtensionAPI): void {
	// ─── Protected paths (ports protect-paths.sh) ──────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;

		const filePath = (event.input as { file_path?: string }).file_path;
		if (!filePath) return;

		const result = isProtectedPath(filePath, ctx.cwd);
		if (!result.blocked) return;

		if (ctx.hasUI) {
			ctx.ui.notify(`⏸ Blocked: ${result.reason}`, "warning");
		}
		return { block: true, reason: result.reason };
	});

	// ─── Command policy (ports command-policy.sh) ──────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;

		const command = (event.input as { command?: string }).command;
		if (!command) return;

		const result = checkCommand(command);
		if (!result.blocked) return;

		if (ctx.hasUI) {
			ctx.ui.notify(`⏸ ${result.reason}`, "warning");
		}
		return { block: true, reason: result.reason };
	});
}
