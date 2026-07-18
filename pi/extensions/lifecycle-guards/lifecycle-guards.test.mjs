// Unit tests for lifecycle-guards pure utility functions.
//
// Tests the ported logic from Claude Code bash hooks:
// - isProtectedPath (protect-paths.sh)
// - checkCommand (command-policy.sh)
// - checkDesignPatterns (design-antipattern-check.sh + design-antipattern-prevent.sh)
// - compressFileContent + validateCompression (compress-memory.sh)
// - isFrontendFile, isMemoryFile (file classification guards)
//
// Requires Node's native TypeScript type stripping:
// on by default on Node >= 23.6, or via --experimental-strip-types on 22.6-23.5.
// (ts-resolve-hook.mjs only handles extensionless import resolution, not parsing.)
//
// Run (Node >= 23.6):  node pi/extensions/lifecycle-guards/lifecycle-guards.test.mjs
// Run (Node 22.6-23.5): node --experimental-strip-types pi/extensions/lifecycle-guards/lifecycle-guards.test.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

// Resolve extensionless relative imports inside the .ts extensions.
register("../ts-resolve-hook.mjs", import.meta.url);

const {
	isProtectedPath,
	checkCommand,
	checkDesignPatterns,
	compressFileContent,
	validateCompression,
	isFrontendFile,
	isMemoryFile,
	SESSION_CONTEXT,
} = await import("./utils.ts");

// ─── isProtectedPath ──────────────────────────────────────────────────────

test("isProtectedPath: safe source file is allowed", () => {
	const result = isProtectedPath("src/App.tsx", "/tmp/test-project");
	assert.equal(result.blocked, false);
});

test("isProtectedPath: .env is blocked", () => {
	const result = isProtectedPath(".env", "/tmp/test-project");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /\.env.*secrets/);
});

test("isProtectedPath: .env.local is blocked", () => {
	const result = isProtectedPath(".env.local", "/tmp/test-project");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /secrets/);
});

test("isProtectedPath: .env.production is blocked", () => {
	const result = isProtectedPath(".env.production", "/tmp/test-project");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /secrets/);
});

test("isProtectedPath: .git/config is blocked", () => {
	const result = isProtectedPath(".git/config", "/tmp/test-project");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /\.git/);
});

test("isProtectedPath: generated/ is blocked", () => {
	const result = isProtectedPath("generated/api.ts", "/tmp/test-project");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /generated/);
});

test("isProtectedPath: path outside repo is blocked", () => {
	const result = isProtectedPath("/etc/passwd", "/tmp/test-project");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /outside the project root/);
});

test("isProtectedPath: .gitignore at repo root is allowed", () => {
	const result = isProtectedPath(".gitignore", "/tmp/test-project");
	assert.equal(result.blocked, false);
});

test("isProtectedPath: path traversal via .. is blocked", () => {
	const result = isProtectedPath("../../etc/passwd", "/tmp/test-project/sub");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /outside the project root/);
});

// ─── checkCommand ─────────────────────────────────────────────────────────

test("checkCommand: safe command is allowed", () => {
	const result = checkCommand("ls -la");
	assert.equal(result.blocked, false);
});

test("checkCommand: rm -rf / is blocked", () => {
	const result = checkCommand("rm -rf /");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /destructive recursive delete/);
});

test("checkCommand: rm -rf ~ is blocked", () => {
	const result = checkCommand("rm -rf ~");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /destructive recursive delete/);
});

test("checkCommand: rm -rf $HOME is blocked", () => {
	const result = checkCommand("rm -rf $HOME");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /destructive recursive delete/);
});

test("checkCommand: rm -rf . is blocked", () => {
	const result = checkCommand("rm -rf .");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /destructive recursive delete/);
});

test("checkCommand: DROP TABLE is blocked", () => {
	const result = checkCommand('psql -c "DROP TABLE users"');
	assert.equal(result.blocked, true);
	assert.match(result.reason, /DROP|TRUNCATE/);
});

test("checkCommand: TRUNCATE TABLE is blocked", () => {
	const result = checkCommand('psql -c "TRUNCATE TABLE logs"');
	assert.equal(result.blocked, true);
	assert.match(result.reason, /DROP|TRUNCATE/);
});

test("checkCommand: cat .env is blocked", () => {
	const result = checkCommand("cat .env");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /reading env/);
});

test("checkCommand: head .env is blocked", () => {
	const result = checkCommand("head .env");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /reading env/);
});

test("checkCommand: git push --force main is blocked", () => {
	const result = checkCommand("git push --force origin main");
	assert.equal(result.blocked, true);
	assert.match(result.reason, /force-pushing.*protected branch/);
});

test("checkCommand: git push --force feature branch is allowed", () => {
	const result = checkCommand("git push --force origin feature-branch");
	assert.equal(result.blocked, false);
});

test("checkCommand: rm -rf node_modules is allowed", () => {
	const result = checkCommand("rm -rf node_modules/");
	assert.equal(result.blocked, false);
});

test("checkCommand: npm install is allowed", () => {
	const result = checkCommand("npm install");
	assert.equal(result.blocked, false);
});

// ─── checkDesignPatterns ──────────────────────────────────────────────────

test("checkDesignPatterns: clean CSS has no warnings", () => {
	const content = `.btn { color: oklch(0.5 0.1 200); background: oklch(0.9 0.02 200); }`;
	const warnings = checkDesignPatterns(content);
	assert.equal(warnings.length, 0);
});

test("checkDesignPatterns: pure black is detected", () => {
	const content = `.card { color: #000; }`;
	const warnings = checkDesignPatterns(content);
	assert.ok(warnings.some((w) => w.includes("Pure black")));
});

test("checkDesignPatterns: pure white is detected", () => {
	const content = `.card { background: #fff; }`;
	const warnings = checkDesignPatterns(content);
	assert.ok(warnings.some((w) => w.includes("Pure white")));
});

test("checkDesignPatterns: HSL is detected", () => {
	const content = `.card { color: hsl(120, 100%, 50%); }`;
	const warnings = checkDesignPatterns(content);
	assert.ok(warnings.some((w) => w.includes("HSL")));
});

test("checkDesignPatterns: purple gradient is detected", () => {
	const content = `.hero { background: linear-gradient(to right, purple, pink); }`;
	const warnings = checkDesignPatterns(content);
	assert.ok(warnings.some((w) => w.includes("Purple/violet gradient")));
});

test("checkDesignPatterns: Inter font is detected", () => {
	const content = `body { font-family: 'Inter', sans-serif; }`;
	const warnings = checkDesignPatterns(content);
	assert.ok(warnings.some((w) => w.includes("Inter")));
});

test("checkDesignPatterns: side-stripe border is detected", () => {
	const content = `.alert { border-left: 4px solid red; }`;
	const warnings = checkDesignPatterns(content);
	assert.ok(warnings.some((w) => w.includes("Side-stripe")));
});

test("checkDesignPatterns: gradient text is detected", () => {
	const content = `.title { background: linear-gradient(to right, red, blue); -webkit-background-clip: text; }`;
	const warnings = checkDesignPatterns(content);
	assert.ok(warnings.some((w) => w.includes("Gradient text")));
});

test("checkDesignPatterns: clean component has no warnings", () => {
	const content = `export default function Clean() { return <div className="ok">Clean</div>; }`;
	const warnings = checkDesignPatterns(content);
	assert.equal(warnings.length, 0);
});

// ─── compressFileContent + validateCompression ────────────────────────────

test("compressFileContent: removes filler words", () => {
	const input = "This is just a really simple test that basically works.";
	const compressed = compressFileContent(input);
	assert.doesNotMatch(compressed, /just|really|basically/);
});

test("compressFileContent: replaces verbose phrases", () => {
	const input = "In order to test, we need to run the suite.";
	const compressed = compressFileContent(input);
	assert.match(compressed, /^to test/);
});

test("compressFileContent: preserves code blocks", () => {
	const input = "Some text.\n\n```js\nconst x = just a test;\n```\n\nMore text.";
	const compressed = compressFileContent(input);
	assert.ok(compressed.includes("const x = just a test;"), "code block content must be preserved");
});

test("compressFileContent: preserves inline code", () => {
	const input = "Use `just` to see if inline code is preserved.";
	const compressed = compressFileContent(input);
	assert.ok(compressed.includes("`just`"), "inline code must be preserved");
});

test("compressFileContent: preserves URLs", () => {
	const input = "See https://example.com/just/really for details.";
	const compressed = compressFileContent(input);
	assert.ok(compressed.includes("https://example.com/just/really"), "URL must be preserved");
});

test("compressFileContent: preserves headings", () => {
	const input = "# Just a Heading\n\nSome really basic content.";
	const compressed = compressFileContent(input);
	assert.ok(compressed.startsWith("# Just a Heading"), "heading must be preserved");
});

test("compressFileContent: preserves frontmatter", () => {
	const input = "---\ntitle: Just a Test\ntags: [really, basic]\n---\n\nSome basically content.";
	const compressed = compressFileContent(input);
	assert.ok(compressed.includes("title: Just a Test"), "frontmatter must be preserved");
	assert.ok(compressed.includes("tags: [really, basic]"), "frontmatter tags must be preserved");
});

test("compressFileContent: preserves tables", () => {
	const input = "| Just | Really |\n|------|--------|\n| A    | B      |";
	const compressed = compressFileContent(input);
	assert.ok(compressed.includes("| Just | Really |"), "table must be preserved");
});

test("validateCompression: passes for valid compression", () => {
	const original = "This is just a really simple test.\n\n```js\nconst x = 1;\n```";
	const compressed = compressFileContent(original);
	const error = validateCompression(original, compressed);
	assert.equal(error, null);
});

test("validateCompression: detects frontmatter corruption", () => {
	const original = "---\ntitle: Test\n---\n\nContent here.";
	const compressed = "---\ntitle: Changed\n---\n\nContent here.";
	const error = validateCompression(original, compressed);
	assert.equal(error, "Frontmatter corrupted");
});

test("validateCompression: detects code block corruption", () => {
	const original = "```js\nconst x = 1;\n```";
	const compressed = "```js\nconst x = 2;\n```";
	const error = validateCompression(original, compressed);
	assert.equal(error, "Code blocks corrupted");
});

test("validateCompression: detects URL corruption", () => {
	const original = "See https://example.com for details.";
	const compressed = "See https://different.com for details.";
	const error = validateCompression(original, compressed);
	assert.equal(error, "URLs corrupted");
});

// ─── File classification ──────────────────────────────────────────────────

test("isFrontendFile: .tsx is frontend", () => {
	assert.equal(isFrontendFile("src/App.tsx"), true);
});

test("isFrontendFile: .jsx is frontend", () => {
	assert.equal(isFrontendFile("src/Component.jsx"), true);
});

test("isFrontendFile: .css is frontend", () => {
	assert.equal(isFrontendFile("styles/main.css"), true);
});

test("isFrontendFile: .html is frontend", () => {
	assert.equal(isFrontendFile("index.html"), true);
});

test("isFrontendFile: .vue is frontend", () => {
	assert.equal(isFrontendFile("App.vue"), true);
});

test("isFrontendFile: .svelte is frontend", () => {
	assert.equal(isFrontendFile("App.svelte"), true);
});

test("isFrontendFile: .ts is not frontend", () => {
	assert.equal(isFrontendFile("src/utils.ts"), false);
});

test("isFrontendFile: .py is not frontend", () => {
	assert.equal(isFrontendFile("src/main.py"), false);
});

test("isMemoryFile: memory/*.md is a memory file", () => {
	assert.equal(isMemoryFile("/project/memory/notes.md"), true);
	// Relative paths (no leading slash) must also match
	assert.equal(isMemoryFile("memory/notes.md"), true);
	assert.equal(isMemoryFile("memory/sub/notes.md"), true);
});

test("isMemoryFile: MEMORY.md index is excluded", () => {
	assert.equal(isMemoryFile("/project/memory/MEMORY.md"), false);
});

test("isMemoryFile: non-memory .md is not a memory file", () => {
	assert.equal(isMemoryFile("/project/docs/readme.md"), false);
});

test("isMemoryFile: non-.md file in memory/ is not a memory file", () => {
	assert.equal(isMemoryFile("/project/memory/data.json"), false);
});

// ─── SESSION_CONTEXT ──────────────────────────────────────────────────────

test("SESSION_CONTEXT: contains workflow reminder", () => {
	assert.match(SESSION_CONTEXT, /idea-refine/);
	assert.match(SESSION_CONTEXT, /wrap-session/);
});
