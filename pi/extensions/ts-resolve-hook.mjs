// Test-only ESM resolve hook: lets `node` import the extension .ts files, which
// use extensionless relative imports (e.g. "./lib/azure-token") that pi's bundler
// resolves but Node's native loader does not. Appends ".ts" when that file exists.
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
