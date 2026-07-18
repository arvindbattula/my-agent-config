/**
 * Pure utility functions for lifecycle-guards extension.
 *
 * Ported from the Claude Code bash hooks (protect-paths.sh, command-policy.sh,
 * design-antipattern-check.sh, compress-memory.sh) to TypeScript so the same
 * deterministic rules run in Pi via extension event handlers.
 *
 * Extracted as pure functions for unit testing — see lifecycle-guards.test.mjs.
 */

// ─── Protected paths ──────────────────────────────────────────────────────

export interface PathCheckResult {
	blocked: boolean;
	reason?: string;
}

/** Exact-match protected file names (secrets). */
const PROTECTED_EXACT = new Set([".env", ".env.local"]);

/** Protected path prefixes (generated code, git internals). */
const PROTECTED_PREFIXES = ["generated/", ".git/"];

/** Protected glob patterns for .env.* files. */
const ENV_GLOB = /^\.env\..+/;

/**
 * Check if a file path is protected from edits/writes.
 * @param filePath - The file path to check (may be relative or absolute).
 * @param cwd - The current working directory (project root).
 * @returns Block result with reason if protected.
 */
export function isProtectedPath(filePath: string, cwd: string): PathCheckResult {
	// Expand ~ to home
	let resolved = filePath;
	if (resolved.startsWith("~")) {
		resolved = resolved.replace(/^~/, process.env.HOME ?? "~");
	}

	// Make absolute
	if (!resolved.startsWith("/")) {
		resolved = `${cwd}/${resolved}`;
	}

	// Normalize (resolve . and ..)
	// Node doesn't have path.resolve for this on import, but we can use a simple approach
	const normalized = normalizePath(resolved);
	const cwdNormalized = normalizePath(cwd);

	// Check: outside project root
	if (!normalized.startsWith(cwdNormalized + "/") && normalized !== cwdNormalized) {
		return {
			blocked: true,
			reason: `${filePath} resolves outside the project root (${cwdNormalized}). Use files within the repo.`,
		};
	}

	// Relative path from project root
	const rel = normalized.startsWith(cwdNormalized + "/")
		? normalized.slice(cwdNormalized.length + 1)
		: "";

	// Check: exact protected files
	if (PROTECTED_EXACT.has(rel)) {
		return {
			blocked: true,
			reason: `${rel} is a secrets file. Do not edit .env files directly.`,
		};
	}

	// Check: .env.* glob
	if (ENV_GLOB.test(rel)) {
		return {
			blocked: true,
			reason: `${rel} is a secrets file. Do not edit .env files directly.`,
		};
	}

	// Check: protected prefixes
	for (const prefix of PROTECTED_PREFIXES) {
		if (rel.startsWith(prefix)) {
			if (prefix === ".git/") {
				return {
					blocked: true,
					reason: `${rel} is inside .git/. Use application code or tests instead.`,
				};
			}
			return {
				blocked: true,
				reason: `${rel} is in generated/. This is auto-generated code — edit the source instead.`,
			};
		}
	}

	return { blocked: false };
}

/** Normalize a path by resolving . and .. components without filesystem access. */
function normalizePath(p: string): string {
	const parts = p.split("/");
	const result: string[] = [];
	for (const part of parts) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			result.pop();
			continue;
		}
		result.push(part);
	}
	const isAbsolute = p.startsWith("/");
	return (isAbsolute ? "/" : "") + result.join("/");
}

// ─── Command policy ───────────────────────────────────────────────────────

export interface CommandCheckResult {
	blocked: boolean;
	reason?: string;
}

interface DenyPattern {
	pattern: RegExp;
	reason: string;
}

const COMMAND_DENY_PATTERNS: DenyPattern[] = [
	// Destructive recursive deletes (root, home, cwd, parent).
	// The cwd rule matches both `.` and `./` (equally destructive) but still
	// allows `./subdir` for artifact cleanup.
	{ pattern: /\brm\s+-rf\s+\/(\s|$)/, reason: "destructive recursive delete (rm -rf root)" },
	{ pattern: /\brm\s+-rf\s+~(\s|$)/, reason: "destructive recursive delete (rm -rf home)" },
	{ pattern: /\brm\s+-rf\s+\$HOME(\s|$)/, reason: "destructive recursive delete (rm -rf home)" },
	{ pattern: /\brm\s+-rf\s+\.\/?(\s|$)/, reason: "destructive recursive delete (rm -rf cwd)" },
	{ pattern: /\brm\s+-rf\s+\.\.(\/|\s|$)/, reason: "destructive recursive delete (rm -rf parent)" },
	// Destructive database commands
	{ pattern: /\b(drop|truncate)\s+table\b/i, reason: "destructive database command (DROP/TRUNCATE TABLE)" },
	// Reading env/secret files
	{ pattern: /\b(cat|less|more|tail|head)\s+.*\.env\b/, reason: "reading env/secrets file" },
	// Force-pushing to protected branches
	{ pattern: /git\s+push.*--force.*\b(main|master)\b/, reason: "force-pushing to protected branch (main/master)" },
	{ pattern: /git\s+push.*\s-f\b.*\b(main|master)\b/, reason: "force-pushing to protected branch (main/master)" },
];

/**
 * Check if a shell command is blocked by the command policy.
 * @param command - The shell command to check.
 * @returns Block result with reason if blocked.
 */
export function checkCommand(command: string): CommandCheckResult {
	for (const { pattern, reason } of COMMAND_DENY_PATTERNS) {
		if (pattern.test(command)) {
			return { blocked: true, reason: `Blocked by command policy: ${reason}. Command: ${command}` };
		}
	}
	return { blocked: false };
}

// ─── Design antipatterns ──────────────────────────────────────────────────

interface AntipatternCheck {
	pattern: RegExp;
	message: string;
}

const DESIGN_ANTIPATTERNS: AntipatternCheck[] = [
	// Font anti-patterns
	{ pattern: /font-family[^;]*\bInter\b/i, message: "⚠ DESIGN: Inter font detected — it's the most overused AI default. Pick a distinctive font for this project's brand." },
	{ pattern: /font-family[^;]*\bRoboto\b/i, message: "⚠ DESIGN: Roboto font detected — generic AI default. Choose a font that reflects the brand personality." },
	{ pattern: /font-family[^;]*\bOpen Sans\b/i, message: "⚠ DESIGN: Open Sans detected — invisible default. Choose a font with personality." },
	// Color anti-patterns
	{ pattern: /#000000|#000[^0-9a-fA-F]|:\s*#000\s*[;]|:\s*#000\s*$/, message: "⚠ DESIGN: Pure black (#000) detected — use tinted neutrals instead. Pure black doesn't exist in nature." },
	{ pattern: /#ffffff|#fff[^0-9a-fA-F]|:\s*#fff\s*[;]|:\s*#fff\s*$/, message: "⚠ DESIGN: Pure white (#fff) detected — use tinted neutrals instead." },
	{ pattern: /hsl\(/i, message: "⚠ DESIGN: HSL color detected — prefer OKLCH for perceptually uniform colors." },
	// Purple gradient (AI signature)
	{ pattern: /linear-gradient.*purple|linear-gradient.*violet|linear-gradient.*indigo/i, message: "⚠ DESIGN: Purple/violet gradient detected — this is the #1 AI aesthetic tell. Use the project's actual brand colors." },
	// Side-stripe borders
	{ pattern: /border-left:\s*[3-9]px|border-left:\s*[1-9][0-9]+px|border-right:\s*[3-9]px|border-right:\s*[1-9][0-9]+px/, message: "⚠ DESIGN: Side-stripe border (>1px) detected — this is a banned AI pattern. Use background tints, full borders, or no indicator instead." },
];

// Gradient text is a two-condition check, handled separately
function checkGradientText(content: string): string | null {
	if (/background-clip:\s*text|-webkit-background-clip:\s*text/.test(content)) {
		if (/linear-gradient|radial-gradient|conic-gradient/.test(content)) {
			return "⚠ DESIGN: Gradient text detected — this is a banned AI pattern. Use a solid color for text emphasis.";
		}
	}
	return null;
}

/**
 * Check file content for design anti-patterns.
 * @param content - The file content to check.
 * @returns Array of warning messages (empty if clean).
 */
export function checkDesignPatterns(content: string): string[] {
	const warnings: string[] = [];
	for (const { pattern, message } of DESIGN_ANTIPATTERNS) {
		if (pattern.test(content)) {
			warnings.push(message);
		}
	}
	const gradientWarning = checkGradientText(content);
	if (gradientWarning) {
		warnings.push(gradientWarning);
	}
	return warnings;
}

// ─── File classification ──────────────────────────────────────────────────

const FRONTEND_EXTENSIONS = [".tsx", ".jsx", ".css", ".html", ".vue", ".svelte"];

/** Check if a file path is a frontend file worth checking for design patterns. */
export function isFrontendFile(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return FRONTEND_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Check if a file path is a memory file worth compressing. */
export function isMemoryFile(filePath: string): boolean {
	// Normalize Windows separators, then require a `.md` under a memory/ segment.
	// Matches both absolute (/project/memory/x.md) and relative (memory/x.md) paths.
	const normalized = filePath.replace(/\\/g, "/");
	if (!normalized.endsWith(".md")) return false;
	// Exclude the MEMORY.md index
	if (normalized === "MEMORY.md" || normalized.endsWith("/MEMORY.md")) return false;
	return /(^|\/)memory\//.test(normalized);
}

// ─── Memory compression ───────────────────────────────────────────────────

const FILLER_WORDS = [
	"just", "really", "basically", "actually", "simply",
	"essentially", "obviously", "clearly", "certainly",
	"definitely", "merely", "quite",
];

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
	[/\bin order to\b/gi, "to"],
	[/\bdue to the fact that\b/gi, "because"],
	[/\bfor the purpose of\b/gi, "for"],
	[/\bwhether or not\b/gi, "whether"],
	[/\bin the event that\b/gi, "if"],
	[/\bat this point in time\b/gi, "now"],
	[/\bhas the ability to\b/gi, "can"],
	[/\bis able to\b/gi, "can"],
	[/\bis not able to\b/gi, "cannot"],
	[/\ba large number of\b/gi, "many"],
	[/\bas a result of\b/gi, "from"],
	[/\bwith regard to\b/gi, "regarding"],
	[/\bin addition to\b/gi, "besides"],
	[/\bthe reason is that\b/gi, "because"],
	[/\bmake sure that\b/gi, "ensure"],
	[/\bit is important to note that\s*/gi, "note: "],
	[/\bit should be noted that\s*/gi, "note: "],
	[/\bin spite of\b/gi, "despite"],
	[/\bat the present time\b/gi, "now"],
	[/\bprior to\b/gi, "before"],
	[/\bsubsequent to\b/gi, "after"],
	[/\bin close proximity to\b/gi, "near"],
	[/\bon a regular basis\b/gi, "regularly"],
	[/\bfor the most part\b/gi, "mostly"],
	[/\ba wide variety of\b/gi, "various"],
	[/\bin the process of\b/gi, "currently"],
	[/\btake into consideration\b/gi, "consider"],
	[/\bgive consideration to\b/gi, "consider"],
	[/\bhas a tendency to\b/gi, "tends to"],
	[/\bin the near future\b/gi, "soon"],
	[/\bat the end of the day\b/gi, "ultimately"],
	[/\bon the other hand\b/gi, "however"],
];

/** Regex matching spans that must not be compressed (code, URLs, file paths). */
const PROTECTED_SPAN = /(`[^`]+`|```[\s\S]*?```|https?:\/\/\S+|\b\w+:\/\/\S+|(?:~\/|\/[\w])[\w/.\-@:]+)/;

/**
 * Compress prose in a markdown file's content.
 * Preserves frontmatter, code blocks, inline code, URLs, file paths, headings, and tables.
 * Only removes filler words and shortens verbose phrases in prose sections.
 */
export function compressFileContent(content: string): string {
	const lines = content.split("\n");
	const result: string[] = [];
	let inFrontmatter = false;
	let fmDelims = 0;
	let inCodeBlock = false;

	for (const line of lines) {
		const stripped = line.trim();

		// Frontmatter delimiters
		if (stripped === "---" && !inCodeBlock) {
			fmDelims++;
			inFrontmatter = fmDelims % 2 === 1;
			result.push(line);
			continue;
		}

		// Preserve frontmatter content
		if (inFrontmatter) {
			result.push(line);
			continue;
		}

		// Code block delimiters
		if (stripped.startsWith("```")) {
			inCodeBlock = !inCodeBlock;
			result.push(line);
			continue;
		}

		// Preserve code block content
		if (inCodeBlock) {
			result.push(line);
			continue;
		}

		// Preserve headings, tables, blank lines, HTML comments
		if (stripped.startsWith("#") || stripped.startsWith("|") || stripped === "" || stripped.startsWith("<!--")) {
			result.push(line);
			continue;
		}

		// Compress prose line
		result.push(compressLine(line));
	}

	return result.join("\n");
}

function compressLine(line: string): string {
	const parts = line.split(PROTECTED_SPAN);
	if (parts.length === 1) {
		return compressProse(line);
	}

	return parts
		.map((part) => (PROTECTED_SPAN.test(part) ? part : compressProse(part)))
		.join("");
}

function compressProse(text: string): string {
	if (!text.trim()) return text;

	for (const filler of FILLER_WORDS) {
		text = text.replace(new RegExp(`\\b${filler}\\s+`, "gi"), "");
	}

	for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
		text = text.replace(pattern, replacement);
	}

	// Clean artifacts
	text = text.replace(/  +/g, " ");
	text = text.replace(/\s+([.,;:!?])(?=\s|$)/g, "$1");

	return text;
}

/**
 * Validate that compression didn't corrupt structured content.
 * @returns null if valid, or an error message string.
 */
export function validateCompression(original: string, compressed: string): string | null {
	// Frontmatter must be identical
	const origFm = extractFrontmatter(original);
	const compFm = extractFrontmatter(compressed);
	if (origFm !== compFm) return "Frontmatter corrupted";

	// Code blocks must be identical
	const origBlocks = original.match(/```[\s\S]*?```/g) ?? [];
	const compBlocks = compressed.match(/```[\s\S]*?```/g) ?? [];
	if (origBlocks.join("\n") !== compBlocks.join("\n")) return "Code blocks corrupted";

	// Strip code fences before checking inline patterns
	const origStripped = original.replace(/```[\s\S]*?```/g, "");
	const compStripped = compressed.replace(/```[\s\S]*?```/g, "");

	// Inline code must be identical
	const origInline = origStripped.match(/`[^`]+`/g) ?? [];
	const compInline = compStripped.match(/`[^`]+`/g) ?? [];
	if (origInline.join("\n") !== compInline.join("\n")) return "Inline code corrupted";

	// URLs must be identical
	const origUrls = origStripped.match(/https?:\/\/\S+/g) ?? [];
	const compUrls = compStripped.match(/https?:\/\/\S+/g) ?? [];
	if (origUrls.join("\n") !== compUrls.join("\n")) return "URLs corrupted";

	// Headings must be identical
	const origH = original.split("\n").filter((l) => l.trim().startsWith("#"));
	const compH = compressed.split("\n").filter((l) => l.trim().startsWith("#"));
	if (origH.join("\n") !== compH.join("\n")) return "Headings corrupted";

	// Line count sanity check
	const origLines = original.split("\n").length;
	const compLines = compressed.split("\n").length;
	if (compLines < origLines * 0.5) return "Too many lines removed";

	return null;
}

function extractFrontmatter(text: string): string {
	const m = text.match(/^---\n[\s\S]*?\n---\n/);
	return m ? m[0] : "";
}

// ─── Session context ──────────────────────────────────────────────────────

export const SESSION_CONTEXT = `Workflow: /idea-refine → /discover → /blueprint → /construct → /inspect → /ship → /retro
For non-trivial tasks, start with a plan (plan-build-verify skill).
Check docs/spec.md, docs/plan.md, docs/state.md if they exist in this project.
Save preferences, library quirks, and surprises to memory as they surface — don't wait.
At session end, run /wrap-session to route learnings to the right place.`;

// ─── Gate state file ──────────────────────────────────────────────────────

export interface DesignGateState {
	/** Map of file path → design anti-pattern warnings still present. */
	failing_files: Record<string, string[]>;
}
