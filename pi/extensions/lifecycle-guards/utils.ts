/**
 * Pure utility functions for lifecycle-guards extension.
 *
 * Ported from the Claude Code bash hooks (protect-paths.sh, command-policy.sh)
 * to TypeScript so the same deterministic rules run in Pi via extension event
 * handlers.
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

