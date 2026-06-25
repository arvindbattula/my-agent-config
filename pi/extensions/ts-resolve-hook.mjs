// Test-only ESM resolve hook. Scope: *resolution only*. The extension .ts files use
// extensionless relative imports (e.g. "./lib/azure-token") that pi's bundler resolves
// but Node's native loader does not; this appends ".ts" when that file exists.
//
// It does NOT transform TypeScript. Parsing the .ts is handled separately by Node's
// native type stripping, which is on by default on Node >= 23.6 (and available behind
// --experimental-strip-types on 22.6-23.5). On older Node the test won't run without a
// dedicated TS loader (e.g. tsx).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[mc]?[jt]s$/.test(specifier)) {
    const candidate = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return next(specifier + ".ts", context);
    }
  }
  return next(specifier, context);
}
