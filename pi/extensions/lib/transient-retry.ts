// Shared transient-error retry helper for Azure Foundry pi extensions.
//
// Both the Anthropic (`azure-foundry.ts`) and OpenAI-compat (`azure-openai-models.ts`)
// providers retry on the same set of transient HTTP statuses (Anthropic's 529
// Overloaded, 429 rate limits, common 5xx) and on fetch-level errors. Doing the
// retry inside the extension keeps each attempt out of pi's chat UI — pi prints
// one "Error: …" line per assistant turn, so by the time pi sees the result
// there is either a success or a single final error.
//
// Pair with `"retry": { "enabled": false }` in `~/.pi/agent/settings.json` so
// pi's outer auto-retry doesn't stack on top of this loop.
//
// Error message format mirrors pi-ai's built-in Anthropic provider so pi's
// `_isRetryableError` regex and the TUI's pretty-printer both behave:
//   HTTP error → `${status} ${body}`     (e.g. "529 {...overloaded_error...}")
//   Fetch threw → `fetch failed: ${msg}` (keyword matched by pi's regex)

export const TRANSIENT_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

export interface RetryConfig {
  /** Attempts AFTER the initial try. Total tries = maxRetries + 1. */
  maxRetries: number;
  /** Backoff base: attempt N waits baseDelayMs * 2**N (so 2s, 4s, 8s with default 2000). */
  baseDelayMs: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 2000;

// Clamp env input to a finite, non-negative number. NaN, negatives, or unset
// env vars fall back to the supplied default — avoids the "Number(...) → NaN
// → loop never runs → 'unknown error'" trap surfaced by code review.
function sanitizeNum(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * Read retry knobs from env. Both extensions use their own env var names so
 * users can tune Anthropic vs OpenAI deployments independently.
 */
export function readRetryConfig(maxEnv: string, baseEnv: string): RetryConfig {
  return {
    maxRetries: sanitizeNum(process.env[maxEnv], DEFAULT_MAX_RETRIES),
    baseDelayMs: sanitizeNum(process.env[baseEnv], DEFAULT_BASE_DELAY_MS),
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type FetchResult =
  | { ok: true; response: Response }
  // `aborted: true` when the failure came from an AbortSignal cancellation
  // (user pressed ESC / cancelled the turn). The caller should report this as
  // stopReason: "aborted", not "error", to preserve pi-ai's standard semantics.
  | { ok: false; aborted: boolean; errorMessage: string };

/**
 * Run a fetch with transient-error retries. The caller passes a thunk that
 * issues the request (so each retry can refresh tokens if needed). On any
 * non-transient outcome or once retries are exhausted, returns a tagged
 * result the caller surfaces as a single error event.
 */
export async function fetchWithTransientRetry(
  doFetch: () => Promise<Response>,
  cfg: RetryConfig,
): Promise<FetchResult> {
  let lastErrorMessage = "";
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    let response: Response;
    try {
      response = await doFetch();
    } catch (err: any) {
      // User cancellation — do NOT retry. fetch() rejects with a DOMException
      // named "AbortError" when the supplied AbortSignal fires. Retrying here
      // would delay the cancel and surface as misleading provider errors.
      // Surface immediately with aborted=true so the caller can set
      // stopReason: "aborted" instead of "error".
      if (err?.name === "AbortError") {
        return { ok: false, aborted: true, errorMessage: err?.message ?? "aborted" };
      }
      // Network-level failure — always treat as transient.
      lastErrorMessage = `fetch failed: ${err?.message ?? String(err)}`;
      if (attempt < cfg.maxRetries) {
        await sleep(cfg.baseDelayMs * 2 ** attempt);
        continue;
      }
      return { ok: false, aborted: false, errorMessage: lastErrorMessage };
    }

    if (response.ok) return { ok: true, response };

    // Non-2xx — retry only if the status is a known-transient code.
    const errText = await response.text();
    lastErrorMessage = `${response.status} ${errText}`;
    if (TRANSIENT_HTTP_STATUS.has(response.status) && attempt < cfg.maxRetries) {
      await sleep(cfg.baseDelayMs * 2 ** attempt);
      continue;
    }
    return { ok: false, aborted: false, errorMessage: lastErrorMessage };
  }

  // Defensive: loop exited without yielding success or terminating (shouldn't happen
  // because maxRetries is non-negative; only reachable if maxRetries was negative
  // before sanitization removed that path).
  return { ok: false, aborted: false, errorMessage: lastErrorMessage || "unknown error" };
}
