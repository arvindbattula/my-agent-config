// Smoke test for questionnaire.ts, the tool plan mode's prompts rely on.
//
// Pi only ships this tool as an example, so nothing else notices if an update
// breaks it. The test runs execute() through the real question UI with key
// presses, checks the non-interactive error path, and fails when Pi's example
// changes so the copy gets reviewed.
//
// Requires Node's native TypeScript type stripping (Node >= 23.6).
//
// Run: node pi/extensions/questionnaire.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { piPackageDir } from "./pi-pkg-resolve.mjs";

register("./statusline-test-hook.mjs", import.meta.url);

const { default: questionnaire } = await import("./questionnaire.ts");

const here = dirname(fileURLToPath(import.meta.url));
const ENTER = "\r";
const ESCAPE = "\x1b";

function loadTool() {
	let tool;
	questionnaire({ registerTool: (t) => (tool = t) });
	return tool;
}

const params = {
	questions: [
		{
			id: "scope",
			prompt: "Which scope?",
			options: [
				{ value: "small", label: "Small" },
				{ value: "big", label: "Big" },
			],
		},
	],
};

// Runs the tool's real UI component, pressing the given key once it has rendered.
function tuiContext(key) {
	const theme = { fg: (_c, t) => t, bg: (_c, t) => t, bold: (t) => t, italic: (t) => t, underline: (t) => t };
	const tui = { requestRender() {}, terminal: { rows: 40, columns: 80 } };
	return {
		mode: "tui",
		ui: {
			custom: (factory) =>
				new Promise((resolve) => {
					const component = factory(tui, theme, {}, resolve);
					assert.ok(component.render(80).join("\n").includes("Which scope?"));
					component.handleInput(key);
				}),
		},
	};
}

const textOf = (result) => result.content.map((part) => part.text).join("");

test("registers a tool named questionnaire", () => {
	assert.equal(loadTool().name, "questionnaire");
});

test("returns an error outside the terminal UI, without touching the UI", async () => {
	const ctx = {
		mode: "print",
		ui: {
			custom() {
				throw new Error("UI must not be used");
			},
		},
	};
	const result = await loadTool().execute("id", params, undefined, undefined, ctx);
	assert.match(textOf(result), /UI not available/);
});

test("an answer in the real UI reaches the tool result", async () => {
	const result = await loadTool().execute("id", params, undefined, undefined, tuiContext(ENTER));
	assert.match(textOf(result), /user selected: 1\. Small/);
});

test("cancelling in the real UI is reported to the model", async () => {
	const result = await loadTool().execute("id", params, undefined, undefined, tuiContext(ESCAPE));
	assert.match(textOf(result), /cancelled/i);
});

test("plan mode lists the tool in both of its modes", () => {
	const source = readFileSync(join(here, "plan-mode", "index.ts"), "utf8");
	for (const name of ["PLAN_MODE_TOOLS", "AIRGAP_MODE_TOOLS"]) {
		const line = source.split("\n").find((l) => l.startsWith(`const ${name} =`));
		assert.ok(line?.includes('"questionnaire"'), `${name} no longer lists questionnaire`);
	}
});

test("the copy matches Pi's current example, apart from the source note", () => {
	const example = readFileSync(
		join(piPackageDir("@earendil-works/pi-coding-agent"), "examples", "extensions", "questionnaire.ts"),
		"utf8",
	);
	const copy = readFileSync(join(here, "questionnaire.ts"), "utf8").replace(/ \*\n \* Copied from pi-coding-agent[\s\S]*?registered\.\n/, "");
	assert.equal(copy, example, "Pi's questionnaire example changed: review it and update questionnaire.ts and its version note");
});
