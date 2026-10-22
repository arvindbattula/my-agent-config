// Test-only ESM resolve hook. Scope: *resolution only*. The extension .ts files use
// extensionless relative imports (e.g. "./lib/azure-token") that pi's bundler resolves
// but Node's native loader does not; this appends ".ts" when that file exists.
//
// It does NOT transform TypeScript. Parsing the .ts is handled separately by Node's
// native type stripping, which is on by default on Node >= 23.6 (and available behind
// --experimental-strip-types on 22.6-23.5). On older Node the test won't run without a
// dedicated TS loader (e.g. tsx).
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { piPackageDir } from "./pi-pkg-resolve.mjs";

// Bare specifier used by azure-openai-models.ts (clampThinkingLevel). The repo
// has no node_modules, so map it to the active pi install's pi-ai dist — the
// same resolution pi's extension loader performs via jiti aliases at load time.
//
// IMPORTANT (2026-11-04): map the ROOT specifier, not "@earendil-works/pi-ai/models".
// The /models subpath is only aliased by the pi >= 1.4.0 loader (#11156); under
// feynman 0.3.48's bundled pi-coding-agent 0.84.2 the root alias points to
// dist/compat.js and a /models subpath suffix mangles into the nonexistent
// dist/compat.js/models (extension load crash). The extension therefore imports
// from the root specifier, and this hook mirrors the loader's root alias.
// compat.js -> index.js -> models.js re-exports clampThinkingLevel in both
// pi-ai 0.84.2 and 1.4.0.
const PI_AI_COMPAT_DIST = join(
	piPackageDir("@earendil-works/pi-ai"),
	"dist",
	"compat.js",
);

export async function resolve(specifier, context, next) {
  if (specifier === "@earendil-works/pi-ai") {
    if (!existsSync(PI_AI_COMPAT_DIST)) {
      throw new Error(`Cannot find pi-ai compat dist at ${PI_AI_COMPAT_DIST}`);
    }
    return { url: pathToFileURL(PI_AI_COMPAT_DIST).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\.[mc]?[jt]s$/.test(specifier)) {
    const candidate = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return next(specifier + ".ts", context);
    }
  }
  return next(specifier, context);
}
