#!/usr/bin/env node
// Regression test: azure-openai-models.ts must load under feynman's bundled
// pi-coding-agent 0.84.2 extension loader (Node dist mode, jiti + getAliases()).
// Run: node ~/.feynman/agent/extensions/verify-azure-openai-models.mjs
// Exit 0 + "extension loaded OK" = pass.
//
// History: 2026-11-04 extension crashed on load because it imported
// `clampThinkingLevel` from "@earendil-works/pi-ai/models" — a subpath only
// aliased by the pi >= 1.4.0 loader (#11156). Feynman 0.3.48's loader prefix-
// aliases the pi-ai root to dist/compat.js, mangling the subpath into the
// nonexistent dist/compat.js/models. Fix: import from the root specifier
// "@earendil-works/pi-ai" (compat.js -> index.js -> models.js chain exports
// clampThinkingLevel in both 0.84.2 and 1.4.0).
import { createRequire } from "node:module";
const APP = "/Users/arvindbattula/.local/share/feynman/feynman-0.3.48-darwin-x64/app/node_modules";
const PCA = `${APP}/@earendil-works/pi-coding-agent`;
const PI_AI = `${PCA}/node_modules/@earendil-works/pi-ai`;
const aliases = {
  "@earendil-works/pi-coding-agent": `${PCA}/dist/index.js`,
  "@earendil-works/pi-ai": `${PI_AI}/dist/compat.js`,
  "@earendil-works/pi-ai/compat": `${PI_AI}/dist/compat.js`,
  "@earendil-works/pi-ai/oauth": `${PI_AI}/dist/oauth.js`,
  "@earendil-works/pi-ai/providers/all": `${PI_AI}/dist/providers/all.js`,
};
const { createJiti } = await import(`${PCA}/node_modules/jiti/lib/jiti-static.mjs`);
const jiti = createJiti(import.meta.url, { moduleCache: false, alias: aliases });
const mod = await jiti.import(
  new URL("./azure-openai-models.ts", import.meta.url).pathname,
  { default: true },
);
if (typeof mod !== "function") {
  console.error("FAIL: default export is not a function:", typeof mod);
  process.exit(1);
}
console.log("extension loaded OK; default is function (extension factory): true");
