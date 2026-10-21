// Test-only ESM resolve hook for statusline.test.mjs.
//
// statusline.ts has two import shapes Node's native loader can't resolve from
// the repo (which has no node_modules):
//   1. Extensionless relative imports ("./lib/session-stats") — same problem
//      ts-resolve-hook.mjs solves; pi's bundler resolves these, Node doesn't.
//      (Duplicated here instead of chaining hooks to avoid registration-order
//      coupling; keep in sync with ts-resolve-hook.mjs.)
//   2. The bare specifier "@earendil-works/pi-tui" (truncateToWidth). Mapped
//      to the pi-tui dist nested in the globally installed
//      @earendil-works/pi-coding-agent package — the same install the other
//      tests locate via `which pi`. truncateToWidth is a trivial string-width
//      helper, so the pi-tui version used for tests does not matter.
//
// Parsing the .ts is Node's native type stripping (>= 23.6).
import { execSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const piBin = execSync("which pi", { encoding: "utf-8" }).trim();
let pkgDir = dirname(realpathSync(piBin));
while (!existsSync(join(pkgDir, "package.json"))) {
	pkgDir = dirname(pkgDir);
}
const piTuiDist = join(pkgDir, "node_modules", "@earendil-works", "pi-tui", "dist", "index.js");
if (!existsSync(piTuiDist)) {
	throw new Error(`Cannot find pi-tui dist at ${piTuiDist}`);
}

export async function resolve(specifier, context, next) {
	if (specifier === "@earendil-works/pi-tui") {
		return { url: pathToFileURL(piTuiDist).href, shortCircuit: true };
	}
	if (specifier.startsWith(".") && !/\.[mc]?[jt]s$/.test(specifier)) {
		const candidate = new URL(specifier + ".ts", context.parentURL);
		if (existsSync(fileURLToPath(candidate))) {
			return next(specifier + ".ts", context);
		}
	}
	return next(specifier, context);
}
