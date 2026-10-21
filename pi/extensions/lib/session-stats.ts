// Pure session-stat helpers for the statusline footer.
//
// Split out of statusline.ts (which imports @earendil-works/pi-tui and
// therefore only loads inside pi's runtime) so the aggregation logic can
// be unit-tested standalone against pi's own usage-totals module.

export interface SessionTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	/** Cache-read share of the latest assistant prompt, in percent (0-100), or null if no assistant prompt had tokens. */
	cacheHitRate: number | null;
}

interface UsageLike {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: { total: number };
}

/**
 * Aggregate usage over ALL session entries, mirroring pi's footer.js
 * getSessionStats() / addUsageToTotals():
 * - assistant messages (usage + latest cache-hit rate),
 * - toolResult messages that carry usage,
 * - standalone `usage` entries (e.g. kind "cache_warm" — these carry real
 *   cost that an assistant/toolResult-only aggregation undercounts),
 * - compaction and branch_summary entries.
 *
 * Takes a full-session entry list (getEntries()-style), not a branch slice,
 * so totals survive compaction.
 */
export function computeSessionTotals(entries: readonly any[]): SessionTotals {
	const totals: SessionTotals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		cacheHitRate: null,
	};
	let latestCacheHitRate: number | null = null;
	for (const entry of entries) {
		let usage: UsageLike | undefined;
		if (entry.type === "usage") {
			usage = entry.usage;
		} else if (entry.type === "message" && entry.message?.role === "assistant") {
			usage = entry.message.usage;
			// pi's footer: hit rate of the latest assistant prompt that had tokens.
			const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
			if (promptTokens > 0) {
				latestCacheHitRate = (usage.cacheRead / promptTokens) * 100;
			}
		} else if (entry.type === "message" && entry.message?.role === "toolResult") {
			usage = entry.message.usage;
		} else if (entry.type === "compaction" || entry.type === "branch_summary") {
			usage = entry.usage;
		}
		if (!usage) continue;
		totals.input += usage.input;
		totals.output += usage.output;
		totals.cacheRead += usage.cacheRead;
		totals.cacheWrite += usage.cacheWrite;
		totals.cost += usage.cost.total;
	}
	totals.cacheHitRate = latestCacheHitRate;
	return totals;
}

/** Compact token formatting, ported from pi's footer.js formatTokens ("4.0k", "12k", "1.5M"). */
export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

/**
 * Strip newlines/tabs/control chars from single-line status text (ported from
 * pi's footer sanitizeStatusText) so one misbehaving extension status cannot
 * corrupt the footer layout. Sort-by-key is applied by the caller.
 */
export function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}
