// Shared Entra ID token acquisition for Azure AI Foundry Pi extensions.
// Caches tokens in memory with a 60-second expiry buffer.

import { execFileSync } from "node:child_process";

let tokenCache: Map<string, { token: string; expiry: number }> = new Map();

export function getAzureToken(resource: string): string {
  const now = Date.now();
  const cached = tokenCache.get(resource);
  if (cached && now < cached.expiry - 60_000) return cached.token;

  const json = execFileSync(
    "az",
    ["account", "get-access-token", "--resource", resource, "-o", "json"],
    { encoding: "utf-8", timeout: 15_000 },
  );
  const parsed = JSON.parse(json);
  const token: string = parsed.accessToken;
  const expiry: number = new Date(parsed.expiresOn).getTime();

  tokenCache.set(resource, { token, expiry });
  return token;
}