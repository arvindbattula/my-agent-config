/**
 * valar-completion-window
 *
 * Valar bills every request on a completion window. Omitted, a request runs on
 * the "Now" window — Valar's most expensive tier (for GLM-5.3: input $1.12 /
 * output $3.52 per 1M tokens vs $0.56 / $1.76 on Standard). Pi's built-in
 * transports cannot send request metadata, so without this extension every
 * Valar call pays the Now rate while `pi/models.json` cost fields are mapped to
 * the standard tier — the UI undercounts real spend.
 *
 * Valar's Chat Completions API accepts `metadata` on the request body
 * (docs.valarhq.ai/support.md): `metadata.completion_window` with values
 * "asap" (Now), "priority" (~10 s ceiling, ~25% cheaper), "standard" (~1 min
 * ceiling, ~50% cheaper), and "flex" (background-only — rejected on
 * synchronous/streaming requests, so it is refused here).
 *
 * This extension uses the official `before_provider_request` hook to merge
 * `metadata.completion_window` into outbound Valar chat-completions payloads.
 * The window is read from the `VALAR_COMPLETION_WINDOW` environment variable
 * (per-session latency/cost knob; unset = "standard"). Existing metadata keys
 * (e.g. a future `completion_webhook`) are preserved — merge, never overwrite.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Environment variable that overrides the completion window (unset = default). */
const ENV_KNOB = "VALAR_COMPLETION_WINDOW";
/** Default window: the tier pi/models.json cost fields are priced against. */
const DEFAULT_WINDOW = "standard";
/** Windows valid for synchronous, streaming chat-completions requests. */
const STREAMABLE_WINDOWS = new Set(["asap", "priority", "standard"]);

function isValarProvider(baseUrl: string | undefined, provider: string | undefined): boolean {
	if (provider === "valar") return true;
	return !!baseUrl && baseUrl.includes("valarhq.ai");
}

/** Map<string, string> metadata merge — preserves keys we do not own.
 *  Returns the payload for chaining, or undefined when there is nothing to do. */
function withCompletionWindow(payload: unknown, window: string): unknown {
	if (!payload || typeof payload !== "object") return undefined;
	const body = payload as { messages?: unknown; metadata?: Record<string, string> };
	// Only chat-completions-shaped payloads carry metadata on Valar.
	if (!Array.isArray(body.messages)) return undefined;
	body.metadata = { ...(body.metadata ?? {}), completion_window: window };
	return payload;
}

export default function (pi: ExtensionAPI) {
	pi.on("before_provider_request", (event, ctx) => {
		if (!isValarProvider(ctx.model?.baseUrl, ctx.model?.provider)) return undefined;

		const requested = process.env[ENV_KNOB]?.trim().toLowerCase();
		const window = requested || DEFAULT_WINDOW;

		if (window === "flex") {
			console.warn(
				`[valar-completion-window] ignoring ${ENV_KNOB}=flex: flex is background-only and Valar rejects it on synchronous/streaming requests`,
			);
			return undefined;
		}
		if (!STREAMABLE_WINDOWS.has(window)) {
			console.warn(
				`[valar-completion-window] ignoring ${ENV_KNOB}="${requested}": not one of asap, priority, standard — falling back to Valar's default (Now tier)`,
			);
			return undefined;
		}

		return withCompletionWindow(event.payload, window);
	});
}
