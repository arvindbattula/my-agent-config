/**
 * Statusline footer for the Pi coding agent.
 *
 * Mirrors the Claude Code `statusline.sh` output as closely as the Pi
 * extension API allows. Renders a two-line footer:
 *
 *   [model] 📁 dir (branch | N files +A -R) | ⚙ thinking
 *   ████████░░ 42% (12k) | $0.34 | ⏱️ 3m 12s
 *
 * Data-source notes (flagged assumptions):
 * - Cost: summed from assistant message usage on the current branch.
 * - Context %/tokens: from ctx.getContextUsage() (Pi's own estimate).
 * - Duration: wall-clock since session_start. Pi does not expose a
 *   cumulative request-duration counter like Claude Code's
 *   cost.total_duration_ms, so this is elapsed session time instead.
 * - "Effort": mapped to Pi's thinking level (off/minimal/low/.../xhigh).
 * - Rate limits (5h/7d): not exposed by Pi -> omitted.
 *
 * Git diff stats (file count, +added/-removed) are not in footerData, so we
 * shell out to git the same way the bash statusline does, with a short cache
 * to avoid spawning git on every render.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";

interface GitStats {
	branch: string;
	files: number;
	added: number;
	removed: number;
}

const GIT_CACHE_MS = 2000;

function runGit(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve) => {
		execFile("git", ["-C", cwd, ...args], { timeout: 1500 }, (err, stdout) => {
			if (err) {
				resolve("");
				return;
			}
			resolve(stdout.toString());
		});
	});
}

async function collectGitStats(cwd: string, branchHint: string | null): Promise<GitStats | null> {
	if (!branchHint) return null;

	const status = await runGit(cwd, ["status", "--porcelain"]);
	const files = status.split("\n").filter((line) => line.trim().length > 0).length;

	let added = 0;
	let removed = 0;
	if (files > 0) {
		const numstat = await runGit(cwd, ["diff", "--numstat", "HEAD"]);
		for (const line of numstat.split("\n")) {
			const [a, r] = line.split("\t");
			if (a !== undefined && r !== undefined) {
				added += Number.parseInt(a, 10) || 0;
				removed += Number.parseInt(r, 10) || 0;
			}
		}
	}

	return { branch: branchHint, files, added, removed };
}

function shortenDir(cwd: string): string {
	const parts = cwd.replace(/\/+$/, "").split("/").filter(Boolean);
	if (parts.length === 0) return "/";
	if (parts.length === 1) return parts[0];
	return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function formatTokens(tokens: number): string {
	return `${Math.floor(tokens / 1000)}k`;
}

function formatDuration(ms: number): string {
	const mins = Math.floor(ms / 60000);
	const secs = Math.floor((ms % 60000) / 1000);
	return `${mins}m ${secs}s`;
}

function buildBar(percent: number, theme: Theme): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.min(10, Math.floor(clamped / 10));
	const empty = 10 - filled;
	const color = clamped >= 90 ? "error" : clamped >= 70 ? "warning" : "success";
	return theme.fg(color, "█".repeat(filled)) + theme.fg("dim", "░".repeat(empty));
}

export default function (pi: ExtensionAPI) {
	const install = (ctx: ExtensionContext) => {
		// Reset per session_start so the timer and git cache reflect the current
		// session, not the original extension load (session_start also fires on
		// /new, /resume, and /fork without reloading the extension module).
		const sessionStart = Date.now();
		let gitCache: { ts: number; stats: GitStats | null } | null = null;
		let gitInFlight = false;

		ctx.ui.setFooter(
			(
				tui: { requestRender: () => void },
				theme: Theme,
				footerData: {
					getGitBranch: () => string | null;
					onBranchChange: (cb: () => void) => () => void;
					getExtensionStatuses?: () => ReadonlyMap<string, string>;
				},
			) => {
				const unsub = footerData.onBranchChange(() => {
					gitCache = null;
					tui.requestRender();
				});

				const refreshGit = (branch: string | null) => {
					if (gitInFlight) return;
					gitInFlight = true;
					void collectGitStats(ctx.cwd, branch).then((stats) => {
						gitCache = { ts: Date.now(), stats };
						gitInFlight = false;
						tui.requestRender();
					});
				};

				return {
					dispose: unsub,
					invalidate() {},
					render(width: number): string[] {
						const branch = footerData.getGitBranch();

						if (!gitCache || Date.now() - gitCache.ts > GIT_CACHE_MS) {
							refreshGit(branch);
						}
						const stats = gitCache?.stats ?? null;

						// Cost from assistant usage on the current branch.
						let cost = 0;
						for (const entry of ctx.sessionManager.getBranch()) {
							if (entry.type === "message" && entry.message.role === "assistant") {
								cost += (entry.message as AssistantMessage).usage.cost.total;
							}
						}

						const usage = ctx.getContextUsage();
						const tokens = usage?.tokens ?? 0;
						const percent = usage?.percent ?? 0;

						const modelName = ctx.model?.name ?? "?";
						const dir = shortenDir(ctx.cwd);
						const thinking = pi.getThinkingLevel?.() ?? "";

						// --- Line 1: model, dir, branch, thinking ---
						let branchSeg = "";
						if (branch) {
							if (stats && stats.files > 0) {
								const pieces = [
									theme.fg("warning", `(${branch}`),
									theme.fg("warning", "|"),
									theme.fg("dim", `${stats.files} files`),
								];
								if (stats.added > 0) pieces.push(theme.fg("success", `+${stats.added}`));
								if (stats.removed > 0) pieces.push(theme.fg("error", `-${stats.removed}`));
								pieces.push(theme.fg("warning", ")"));
								branchSeg = ` ${theme.fg("dim", "|")} ${pieces.join(" ")}`;
							} else {
								branchSeg = ` ${theme.fg("dim", "|")} ${theme.fg("warning", `(${branch})`)}`;
							}
						}

						const thinkingSeg =
							thinking && thinking !== "off"
								? ` ${theme.fg("dim", "|")} ${theme.fg("accent", `⚙ ${thinking}`)}`
								: "";

						// Extension status indicators (e.g. plan-mode's "⏸ plan").
						// setStatus() writes here; a custom footer must render them itself.
						let extSeg = "";
						const statuses = footerData.getExtensionStatuses?.();
						if (statuses && statuses.size > 0) {
							const parts = [...statuses.values()].filter((v) => v && v.length > 0);
							if (parts.length > 0) {
								extSeg = ` ${theme.fg("dim", "|")} ${parts.join(" ")}`;
							}
						}

						const line1 =
							`${theme.fg("accent", `[${modelName}]`)} ${theme.fg("text", "📁")} ${theme.fg("text", dir)}` +
							branchSeg +
							thinkingSeg +
							extSeg;

						// --- Line 2: context bar, %, tokens, cost, duration ---
						const bar = buildBar(percent, theme);
						const pct = theme.fg("text", `${Math.floor(percent)}%`);
						const tok = theme.fg("dim", `(${formatTokens(tokens)})`);
						const costStr = theme.fg("warning", `$${cost.toFixed(2)}`);
						const dur = theme.fg("text", `⏱️ ${formatDuration(Date.now() - sessionStart)}`);
						const sep = theme.fg("dim", "|");

						const line2 = `${bar} ${pct} ${tok} ${sep} ${costStr} ${sep} ${dur}`;

						return [truncateToWidth(line1, width), truncateToWidth(line2, width)];
					},
				};
			},
		);
	};

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		install(ctx);
	});
}
