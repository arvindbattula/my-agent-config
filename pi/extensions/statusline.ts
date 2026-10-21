/**
 * Statusline footer for the Pi coding agent.
 *
 * Mirrors the Claude Code `statusline.sh` output as closely as the Pi
 * extension API allows. Renders a two-line footer:
 *
 *   [model] 📁 dir (branch | N files +A -R) | ⚙ thinking
 *   ████████░░ 42%/200k (auto) ↑4k ↓12k R900k CH75% | $0.34 | ⏱️ 3m 12s
 *
 * Data-source notes (flagged assumptions):
 * - Cost + token stats: aggregated from ALL session entries (assistant,
 *   toolResult, standalone `usage` entries such as cache_warm, compaction,
 *   branch_summary) via getEntries(), matching pi's built-in footer and
 *   /stats. Previously scoped to getBranch() and assistant-only, which
 *   undercounted after compaction and missed tool/summary/cache-warm usage.
 *   Memoized on (sessionId, leafId, entryCount, model) like pi's
 *   getSessionStats() — entry count alone goes stale after /fork or a model
 *   switch.
 * - Context %: from ctx.getContextUsage() (Pi's own estimate), rendered
 *   pi-style as "42%/200k (auto)" — or "?/200k" right after compaction,
 *   when tokens are unknown until the next LLM response.
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

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { computeSessionTotals, formatTokens, sanitizeStatusText, type SessionTotals } from "./lib/session-stats";

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
		// Pre-seed with an expired timestamp so the first render triggers a git
		// refresh immediately (no cold-start flicker of missing branch stats).
		let gitCache: { ts: number; stats: GitStats | null } = { ts: -Infinity, stats: null };
		let gitInFlight = false;
		// Memoize session stats: getEntries() is O(n) and render() fires on
		// every text delta. Recompute only when the key changes. Keyed like
		// pi's footer getSessionStats(): (sessionId, leafId, entryCount,
		// model) — entry count alone goes stale after /fork or a model
		// switch, and the model determines the context window the stats
		// apply to.
		let statsCache: { key: string; totals: SessionTotals } | null = null;

		ctx.ui.setFooter(
			(
				tui: { requestRender: () => void },
				theme: Theme,
				footerData: {
					getGitBranch: () => string | null;
					onBranchChange: (cb: () => void) => () => void;
					getExtensionStatuses: () => ReadonlyMap<string, string>;
				},
			) => {
				let disposed = false;
				const unsub = footerData.onBranchChange(() => {
					gitCache = { ts: -Infinity, stats: null };
					if (!disposed) tui.requestRender();
				});

				const refreshGit = (branch: string | null) => {
					if (gitInFlight || disposed) return;
					gitInFlight = true;
					void collectGitStats(ctx.cwd, branch).then((stats) => {
						gitInFlight = false;
						if (disposed) return;
						gitCache = { ts: Date.now(), stats };
						tui.requestRender();
					});
				};

				return {
					dispose() { disposed = true; unsub(); },
					invalidate() {},
					render(width: number): string[] {
						const branch = footerData.getGitBranch();

						if (Date.now() - gitCache.ts > GIT_CACHE_MS) {
							refreshGit(branch);
						}
						const stats = gitCache.stats;

						// Session stats (memoized): aggregated over ALL session
						// entries — assistant + toolResult messages, standalone
						// `usage` entries (cache_warm), compaction and
						// branch_summary — mirroring pi's footer.js
						// getSessionStats(). getEntries() is the full session,
						// not getBranch(), so totals survive compaction
						// (getBranch() drops everything compacted away).
						const allEntries = ctx.sessionManager.getEntries();
						const cacheKey = [
							ctx.sessionManager.getSessionId(),
							ctx.sessionManager.getLeafId(),
							allEntries.length,
							`${ctx.model?.provider ?? "?"}/${ctx.model?.id ?? "?"}`,
						].join("|");
						if (statsCache === null || statsCache.key !== cacheKey) {
							statsCache = { key: cacheKey, totals: computeSessionTotals(allEntries) };
						}
						const totals = statsCache.totals;

						const usage = ctx.getContextUsage();
						const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
						// null = unknown (right after compaction, before the next LLM response).
						const percent = usage?.percent ?? null;

						const modelName = ctx.model?.name ?? "?";
						const dir = shortenDir(ctx.cwd);
						const thinking = pi.getThinkingLevel();

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
							thinking !== "off"
								? ` ${theme.fg("dim", "|")} ${theme.fg("accent", `⚙ ${thinking}`)}`
								: "";

						// Extension status indicators (e.g. plan-mode's "⏸ plan").
						// setStatus() writes here; a custom footer must render them itself.
						// Sanitized (a control char in a status would corrupt the
						// footer layout) and sorted alphabetically by extension
						// key, matching pi's built-in footer.
						let extSeg = "";
						const statuses = footerData.getExtensionStatuses();
						if (statuses.size > 0) {
							const parts = [...statuses.entries()]
								.sort(([a], [b]) => a.localeCompare(b))
								.map(([, v]) => sanitizeStatusText(v ?? ""))
								.filter((v) => v.length > 0);
							if (parts.length > 0) {
								extSeg = ` ${theme.fg("dim", "|")} ${parts.join(" ")}`;
							}
						}

						const line1 =
							`${theme.fg("accent", `[${modelName}]`)} ${theme.fg("text", "📁")} ${theme.fg("text", dir)}` +
							branchSeg +
							thinkingSeg +
							extSeg;

						// --- Line 2: context bar, %/window (auto), token stats, cost, duration ---
						const bar = buildBar(percent ?? 0, theme);
						// Pi-style context display: "42%/200k (auto)", or "?/200k
						// (auto)" right after compaction when tokens are unknown
						// until the next LLM response. Note: getSettings() is on the
						// ExtensionAPI (pi) only in pi-coding-agent >= 1.x —
						// feynman 0.3.48 bundles 0.84.2, which lacks it. Guard
						// the call; when unavailable, default to " (auto)"
						// (pi's default: compaction enabled).
						const piWithSettings = pi as ExtensionAPI & {
							getSettings?: () => { compaction?: { enabled?: boolean } };
						};
						const compactionEnabled =
							typeof piWithSettings.getSettings === "function"
								? piWithSettings.getSettings().compaction?.enabled
								: undefined;
						const autoCompact = compactionEnabled !== false ? " (auto)" : "";
						const pctText =
							percent !== null
								? `${percent.toFixed(1)}%/${formatTokens(contextWindow)}${autoCompact}`
								: `?/${formatTokens(contextWindow)}${autoCompact}`;
						const pctColor =
							percent === null ? "text" : percent > 90 ? "error" : percent > 70 ? "warning" : "text";
						const pct = theme.fg(pctColor, pctText);

						// Token breakdown + cache-hit rate, matching pi's footer
						// stats line: only non-zero parts, CH only when there is
						// cache activity.
						const statParts: string[] = [];
						if (totals.input > 0) statParts.push(`↑${formatTokens(totals.input)}`);
						if (totals.output > 0) statParts.push(`↓${formatTokens(totals.output)}`);
						if (totals.cacheRead > 0) statParts.push(`R${formatTokens(totals.cacheRead)}`);
						if (totals.cacheWrite > 0) statParts.push(`W${formatTokens(totals.cacheWrite)}`);
						if (totals.cacheRead + totals.cacheWrite > 0 && totals.cacheHitRate !== null) {
							statParts.push(`CH${totals.cacheHitRate.toFixed(1)}%`);
						}
						const tok = statParts.length > 0 ? theme.fg("dim", statParts.join(" ")) : "";
						const costStr = theme.fg("warning", `$${totals.cost.toFixed(2)}`);
						const dur = theme.fg("text", `⏱️ ${formatDuration(Date.now() - sessionStart)}`);
						const sep = theme.fg("dim", "|");

						const line2 = `${bar} ${pct}${tok ? ` ${tok}` : ""} ${sep} ${costStr} ${sep} ${dur}`;

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
