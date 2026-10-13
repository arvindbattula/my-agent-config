// Test-only ESM resolve hook. Scope: *resolution only*. The extension .ts files use
// extensionless relative imports (e.g. "./lib/azure-token") that pi's bundler resolves
// but Node's native loader does not; this appends ".ts" when that file exists.
//
// It also aliases "@earendil-works/pi-ai" to pi's bundled compat entrypoint. The
// extensions import transcript helpers from it, and pi maps that bare specifier for
// every extension it loads (see pi-coding-agent dist/core/extensions/loader.js,
// getAliases()). Node cannot: the package lives inside pi's managed install, which is
// not on the extensions directory's node_modules chain. We locate the release the same
// way pi's own launcher does — by reading install/current-version.
//
// It does NOT transform TypeScript. Parsing the .ts is handled separately by Node's
// native type stripping, which is on by default on Node >= 23.6 (and available behind
// --experimental-strip-types on 22.6-23.5). On older Node the test won't run without a
// dedicated TS loader (e.g. tsx).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PI_AI_ALIASES = resolvePiAiAliases();

function resolvePiAiAliases() {
  const agentDir = process.env.PI_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  const versionFile = join(agentDir, "install", "current-version");
  if (!existsSync(versionFile)) return {};
  const version = readFileSync(versionFile, "utf8").trim();
  const pkgDir = join(agentDir, "install", "releases", version, "node_modules", "@earendil-works", "pi-ai");
  if (!existsSync(pkgDir)) return {};
  // Mirror pi's alias table: the bare root maps to compat, a strict superset of the
  // core entrypoint. Subpaths keep their own files.
  return {
    "@earendil-works/pi-ai": join(pkgDir, "dist", "compat.js"),
    "@earendil-works/pi-ai/compat": join(pkgDir, "dist", "compat.js"),
    "@earendil-works/pi-ai/oauth": join(pkgDir, "dist", "oauth.js"),
    "@earendil-works/pi-ai/providers/all": join(pkgDir, "dist", "providers", "all.js"),
  };
}

export async function resolve(specifier, context, next) {
  const aliased = PI_AI_ALIASES[specifier];
  if (aliased) {
    return { url: pathToFileURL(aliased).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\.[mc]?[jt]s$/.test(specifier)) {
    const candidate = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return next(specifier + ".ts", context);
    }
  }
  return next(specifier, context);
}
