import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 *
 * ── Phase 1 hardening (see AUDIT.md + tests/corpus.ts) ──────────────
 * The old prefix-anchored allowlist + raw-substring denylist could not model
 * shell composition: `cat x | sh` sailed through. New architecture:
 *   1. Quote-aware split into segments on | || ; && & and newlines.
 *      Unbalanced quotes => unparseable => block (conservative).
 *   2. Every segment must pass: optional version exception, no head-deny token
 *      (network / bare interpreter as the FIRST WORD — not as an argument),
 *      an allowlisted head, and no per-command flag guard (sed e/w/r, awk
 *      exec/redirect, sort -o, git --output/-c).
 *   3. Whole-command denies: destructive words, command/process substitution,
 *      /dev/tcp, /dev/udp, find write-flags, and UNQUOTED redirects (a quoted
 *      '>' inside an awk script is a comparison, not a shell redirect).
 * This layer is UX + defense-in-depth; the real boundary is the Phase 2 kernel
 * sandbox. A denylist can never be complete — do not treat it as one.
 */

// Commands exempt from the interpreter head-deny (read-only version probes).
const VERSION_EXCEPTIONS = [
	/^\s*node\s+--version\s*$/i,
	/^\s*python3?\s+--version\s*$/i,
];

// Segment-head denies: the FIRST WORD of any segment must not be one of these.
// (Head-token matching, not substring: `grep ssh README.md` stays allowed while
// `ssh host` and `cat x | curl ...` are blocked.)
const HEAD_DENY: { pattern: RegExp; reason: string }[] = [
	{
		pattern: /^\s*(curl|wget|nc|ncat|netcat|socat|telnet|dig|nslookup|host|ftp|scp|sftp|ssh\S*)\b/i,
		reason: "network access not allowed",
	},
	{
		pattern: /^\s*(sh|bash|zsh|dash|ksh|python\d*|node|perl|ruby|osascript|deno|php|lua|tclsh)\b/i,
		reason: "interpreter/exec escape not allowed",
	},
];

// Per-command flag guards, applied when the segment head is the command.
// Conservative: when in doubt, block.
const SED_DENY = [
	/(^|[\s,;'"\)])\d*[eE](\s|$)/, // sed e command (executes pattern space), incl. after an address: '1e'
	/(^|[\s,;'"\)])[wW](\s|$)/, // sed w command (writes a file)
	/(^|[\s,;'"\)])[rR](\s|$)/, // sed r command (inserts a file — conservative)
	/\/\s*[wWeE](\s|\/)/, // s-command w/e flag: s/x/y/w file, s/x/y/e (GNU eval)
];
const AWK_DENY = [
	/getline/i, // command pipe exec
	/system\s*\(/i,
	/\|&/, // gawk coprocess (also /inet/)
	/\/inet\//i,
	/(?:print|printf)\s*(>|\|)/i, // awk output redirect / pipe ("print > \"file\"")
];
const FLAG_GUARDS: { head: RegExp; deny: RegExp[]; reason: string }[] = [
	{ head: /^sed\b/, deny: SED_DENY, reason: "sed e/w/r command not allowed" },
	{ head: /^awk\b/, deny: AWK_DENY, reason: "awk exec/redirect/network not allowed" },
	{ head: /^sort\b/, deny: [/(^|\s)(-o|--output)(\s|=|$)/], reason: "sort output flag writes a file" },
	{
		head: /^git\b/,
		deny: [/(^|\s)(--output|--ext-diff)(\s|=|$)/, /(^|\s)-c\s/],
		reason: "git write/config-injection flag not allowed",
	},
];

// Whole-command denies. Words stay substring-class (deliberately conservative;
// quoting does NOT exempt them — `cat \"rm\"` blocks, same as before Phase 1).
// REMOVED vs the pre-Phase-1 list (each moved to a stronger, more specific home):
//   - network words (curl…ftp) → HEAD_DENY (head-token; fixes `cat ~/.ssh/…` FP)
//   - `>` / `>>` redirects → hasUnquotedRedirect() (quote-aware; fixes awk `>` FP)
//   - perl / ruby → HEAD_DENY
const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
	// interpreter / command-substitution escapes
	/\bsystem\s*\(/i,
	/\beval\b/i,
	/\bexec\b/i,
	/\bxargs\b/i,
	/-exec\b/i,
	/-execdir\b/i,
	/-delete\b/i,
	/-ok(dir)?\b/i,
	/-fprintf?\b/i,
	/-fprint0\b/i,
	/-fls\b/i,
	/\$\(/, // $(...) command substitution
	/`/, // backtick command substitution
	/\<\(/, // <(...) process substitution (runs a subshell)
	// bash /dev/tcp and /dev/udp pseudo-files — network egress via any
	// file-reading command (cat, head, tail, etc.).
	/\/dev\/tcp\b/i,
	/\/dev\/udp\b/i,
];

// Plan-mode allowlisted segment heads (first word of each segment).
// Phase 1 changes vs the old SAFE_PATTERNS:
//   - REMOVED: less, more (pagers; no TTY in pi bash — closes !cmd/-o logfile class)
//   - REMOVED: npm view|info|search|outdated|audit, yarn list|info|why|audit
//     (registry network egress; hostile .npmrc can redirect to any host)
//   - REMOVED: node --version / python --version (now VERSION_EXCEPTIONS)
//   - CHANGED: env → exact bare `env` only (kills LD_PRELOAD / PAGER= injection)
const PLAN_SAFE_HEADS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\s*$/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)\b/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls)\b/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*eza\b/,
];

/**
 * Quote-aware split of a shell command into pipeline/sequence segments on
 * unquoted | || ; && & and newlines. Quote characters are preserved in the
 * segment text (sed/awk guards need them). Returns parseOk=false on
 * unbalanced quotes — callers must treat that as a block.
 */
export function splitSegments(command: string): { segments: string[]; parseOk: boolean } {
	const segments: string[] = [];
	let cur = "";
	let inSingle = false;
	let inDouble = false;
	const push = () => {
		const trimmed = cur.trim();
		if (trimmed) segments.push(trimmed);
		cur = "";
	};
	for (let i = 0; i < command.length; i++) {
		const c = command[i];
		const next = command[i + 1];
		if (c === "'" && !inDouble) {
			inSingle = !inSingle;
			cur += c;
		} else if (c === '"' && !inSingle) {
			inDouble = !inDouble;
			cur += c;
		} else if (!inSingle && !inDouble) {
			if (c === "\n") {
				push();
			} else if (c === "|") {
				if (next === "|") i++;
				push();
			} else if (c === ";") {
				push();
			} else if (c === "&") {
				if (next === "&") i++;
				push();
			} else {
				cur += c;
			}
		} else {
			cur += c;
		}
	}
	if (inSingle || inDouble) {
		push();
		return { segments, parseOk: false };
	}
	push();
	return { segments, parseOk: true };
}

/**
 * True if `>` or `>>` appears OUTSIDE quotes (a real shell redirect) — with one
 * approved carve-out (owner, 2026-10-22): redirects whose destination is exactly
 * `/dev/null` (`2>/dev/null`, `2>>/dev/null`, `>/dev/null`, `&>/dev/null`) write
 * nowhere — the null device is a sink, not a file — so they are allowed. The
 * lookahead (`(?![\w./-])`) keeps `2>/dev/null.txt` or a continued path blocked.
 */
function hasUnquotedRedirect(command: string): boolean {
	let inSingle = false;
	let inDouble = false;
	let i = 0;
	while (i < command.length) {
		const c = command[i];
		if (c === "'" && !inDouble) {
			inSingle = !inSingle;
			i++;
		} else if (c === '"' && !inSingle) {
			inDouble = !inDouble;
			i++;
		} else if (!inSingle && !inDouble && c === ">") {
			const sink = /^>{1,2}\s*\/dev\/null(?![\w./-])/.exec(command.slice(i));
			if (sink) {
				i += sink[0].length; // approved null-sink redirect — skip it
				continue;
			}
			return true;
		} else {
			i++;
		}
	}
	return false;
}

/** Reason a single segment is blocked, or null if it is fine. */
function segmentReason(segment: string, safeHeads: RegExp[]): string | null {
	if (VERSION_EXCEPTIONS.some((p) => p.test(segment))) return null;
	for (const deny of HEAD_DENY) {
		if (deny.pattern.test(segment)) return deny.reason;
	}
	if (!safeHeads.some((p) => p.test(segment))) {
		return "command not on the read-only allowlist";
	}
	for (const guard of FLAG_GUARDS) {
		if (guard.head.test(segment) && guard.deny.some((d) => d.test(segment))) {
			return guard.reason;
		}
	}
	return null;
}

/** Shared reasoner for both tiers. Returns null when the command is allowed. */
function commandReason(command: string, safeHeads: RegExp[]): string | null {
	const { segments, parseOk } = splitSegments(command);
	if (!parseOk) return "cannot safely parse command (unbalanced quotes)";
	if (/\$\(|`|\<\(/.test(command)) return "command or process substitution not allowed";
	if (/\/dev\/tcp|\/dev\/udp/i.test(command)) return "network access via /dev/tcp or /dev/udp not allowed";
	for (let i = 0; i < segments.length; i++) {
		const why = segmentReason(segments[i], safeHeads);
		if (why) return `segment ${i + 1}: ${why} — ${segments[i]}`;
	}
	if (hasUnquotedRedirect(command)) return "output redirection not allowed";
	if (DESTRUCTIVE_PATTERNS.some((p) => p.test(command))) return "destructive command not allowed";
	return null;
}

export function isSafeCommand(command: string): boolean {
	return commandReason(command, PLAN_SAFE_HEADS) === null;
}

// Airgap mode: a *tiny* read-only core. Intentionally much smaller than the
// plan-mode head list. Same deny machinery (segment splitting, head-denies,
// flag guards, redirects, substitution) — only the allowlist shrinks.
const AIRGAP_SAFE_HEADS = [
	/^\s*cat\b/,
	/^\s*grep\b/,
	/^\s*ls\b/,
	/^\s*find\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*wc\b/,
	/^\s*pwd\b/,
];

export function isAirgapSafeCommand(command: string): boolean {
	return commandReason(command, AIRGAP_SAFE_HEADS) === null;
}

/**
 * Human-readable reason a command is blocked in airgap mode.
 * Returns null if the command is actually safe. Specific reasons (network,
 * substitution, interpreter, redirect, unparseable) pass through; generic
 * allowlist misses become the airgap-specific message.
 */
export function airgapBlockReason(command: string): string | null {
	const reason = commandReason(command, AIRGAP_SAFE_HEADS);
	if (reason === null) return null;
	if (reason.includes("not on the read-only allowlist")) {
		return "airgap mode allows only: cat, grep, ls, find, head, tail, wc, pwd (local read-only)";
	}
	return reason;
}

/**
 * Human-readable reason a command is blocked in plan mode.
 * Returns null if the command is actually safe. Segment-indexed reasons
 * point the model at the exact offending part of a pipeline.
 */
export function blockReason(command: string): string | null {
	return commandReason(command, PLAN_SAFE_HEADS);
}

export interface TodoItem {
	step: number;
	/** Cleaned, truncated text for UI display. */
	text: string;
	/** Original full step text for prompts. */
	rawText: string;
	completed: boolean;
	/** Natural-language completion condition ("- done when: ...") — Phase 3. */
	doneWhen?: string;
	/** Files the step touches ("(files: ...)") — informational, Phase 3. */
	files?: string;
	/**
	 * Executable check ("[Verify: <command>]") — Phase 3. The hash locks the
	 * definition (audit trail); redWitnessed/verified/failStreak are runtime
	 * state owned by the HARNESS, never the model. Steps without a check can
	 * only ever be model-REPORTED done, never verified.
	 */
	check?: {
		command: string;
		hash: string;
		redWitnessed?: boolean;
		verified?: boolean;
		failStreak?: number;
	};
}

/** Stable per-plan hash of a check definition (audit/lock trail). */
export function checkHash(stepNumber: number, command: string): string {
	return createHash("sha256").update(`${stepNumber}|${command}`).digest("hex").slice(0, 16);
}

/** Project-local plan-mode config: `.pi/plan-mode.json` (all optional). */
export interface PlanModeConfig {
	/** Harness-verified step completion (Phase 3). Default: true. */
	verifySteps: boolean;
	/** Default check for steps without an inline [Verify: ...] (Aider --test-cmd pattern). */
	defaultCheck?: string;
	/** Extra denyRead paths for the Phase 2 sandbox in plan mode (airgap list is fixed). */
	denyRead: string[];
}

export function loadPlanModeConfig(cwd: string): PlanModeConfig {
	try {
		const configPath = join(cwd, ".pi", "plan-mode.json");
		if (!existsSync(configPath)) return { verifySteps: true, denyRead: [] };
		const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
			verifySteps?: unknown;
			defaultCheck?: unknown;
			denyRead?: unknown;
		};
		return {
			verifySteps: parsed.verifySteps !== false,
			defaultCheck: typeof parsed.defaultCheck === "string" ? parsed.defaultCheck : undefined,
			denyRead: Array.isArray(parsed.denyRead) && parsed.denyRead.every((e) => typeof e === "string")
				? (parsed.denyRead as string[])
				: [],
		};
	} catch {
		return { verifySteps: true, denyRead: [] };
	}
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
		.replace(/`([^`]+)`/g, "$1") // Remove code
		.replace(
			/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	if (cleaned.length > 50) {
		cleaned = `${cleaned.slice(0, 47)}...`;
	}
	return cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	// Capture the full line and let cleanStepText strip markdown. Handling
	// bold here (\*{0,2} + [^*\n]) truncated steps at the first '*', dropping
	// any text after a bold span (e.g. "**Read the file** and analyze it").
	const numberedPattern = /^\s*(\d+)[.)]\s+([^\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		// Keep rawText as the unmodified captured line (preserves emphasis/code
		// markers for prompts). Strip balanced bold spans only for the guard checks
		// and UI text, so trailing text after a bold span survives and lone '*'
		// (e.g. *.py globs) is preserved.
		const rawText = match[2].trim();
		const stripped = rawText.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1").trim();
		if (
			stripped.length > 5 &&
			!stripped.startsWith("`") &&
			!stripped.startsWith("/") &&
			!stripped.startsWith("-")
		) {
			// Phase 3: parse the structured suffixes the Phase 1b prompt teaches:
			//   N. <action> - done when: <condition> [Verify: <command>] (files: <paths>)
			// Suffixes are optional; rawText keeps the full line either way.
			const doneWhenMatch = stripped.match(/[-–—]\s*done when:\s*(.+?)(?=\s*\[Verify:|\s*\(files:|$)/i);
			const verifyMatch = rawText.match(/\[Verify:\s*(.+?)\s*\]/i);
			const filesMatch = rawText.match(/\(files:\s*(.+?)\s*\)/i);
			// Display text = the action part only (suffixes live in doneWhen/check/files).
			const actionOnly = stripped
				.replace(/\s*[-–—]\s*done when:.*$/i, "")
				.replace(/\s*\[Verify:.*$/i, "")
			.replace(/\s*\(files:.*$/i, "")
				.trim();
			const cleaned = cleanStepText(actionOnly);
			if (cleaned.length > 3) {
				items.push({
					step: items.length + 1,
					text: cleaned,
					rawText,
					completed: false,
					doneWhen: doneWhenMatch?.[1]?.trim(),
					files: filesMatch?.[1]?.trim(),
					check: verifyMatch
						? { command: verifyMatch[1].trim(), hash: checkHash(items.length + 1, verifyMatch[1].trim()) }
						: undefined,
				});
			}
		}
	}
	return items;
}

/**
 * Phase 4: trigger assist — should this user prompt get a "consider /plan?" nudge?
 * Deliberately conservative (an abstain class beats nagging — the one measured
 * auto-router missed 81% under ambiguity; surfacing risk to the same model
 * barely changes behavior, so this only NOTIFIES, never auto-enters):
 *   suggest  = keyword hit (refactor/migrate/rewrite/…) OR ≥3 distinct file mentions
 *   abstain  = short/direct asks (<40 chars), explicit directness markers
 *              ("just", "quick fix", "don't plan", …), or neither trigger
 */
const PLAN_SUGGEST_KEYWORDS =
	/\b(refactor(?:ing|ed)?|migrat\w+|restructure|redesign|rewrite|rework|architect\w*|overhaul|multi-?file|several files|many files|across the (?:codebase|repo|project|module))\b/i;
const DIRECTNESS_MARKERS = /\b(?:just|quickly|quick fix|one-?liner|straight to|don'?t plan|no plan|trivial)\b/i;
const FILE_TOKEN =
	/(?:[\w./~-]+\/[\w./~-]+|\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|c|h|cpp|cs|php|swift|kt|sql|sh|json|ya?ml|toml|md))\b/gi;

export function shouldSuggestPlan(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 40) return false; // short/direct asks: abstain
	if (DIRECTNESS_MARKERS.test(trimmed)) return false; // user signaled directness: abstain
	if (PLAN_SUGGEST_KEYWORDS.test(trimmed)) return true;
	const fileMatches = trimmed.match(FILE_TOKEN);
	return fileMatches !== null && new Set(fileMatches.map((f) => f.toLowerCase())).size >= 3;
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const doneSteps = extractDoneSteps(text);
	for (const step of doneSteps) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return doneSteps.length;
}
