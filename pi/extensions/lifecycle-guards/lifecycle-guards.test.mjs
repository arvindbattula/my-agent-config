// Unit tests for lifecycle-guards pure utility functions.
//
// Tests the ported logic from Claude Code bash hooks:
// - isProtectedPath (protect-paths.sh)
// - checkCommand (command-policy.sh)
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

const { isProtectedPath, checkCommand } = await import("./utils.ts");

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
