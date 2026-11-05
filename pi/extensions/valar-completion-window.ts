/**
 * valar-completion-window  (+ `/valar` picker command)
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
 * Two mechanisms share one knob, `VALAR_COMPLETION_WINDOW`:
 *
 * - **Injection**: the official `before_provider_request` hook merges
 *   `metadata.completion_window` into every outbound Valar chat-completions
 *   payload. The hook re-reads the env on each request, so mid-session changes
 *   apply to the next request, not just sessions launched after the fact.
 *   Existing metadata keys are preserved — merge, never overwrite.
 *
 * - **`/valar` picker**: `pi.registerCommand` command for interactive and
 *   argument-driven selection, described in its own doc block below.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Environment variable that overrides the completion window (unset = default). */
const ENV_KNOB = "VALAR_COMPLETION_WINDOW";
/** Default window: the tier pi/models.json cost fields are priced against. */
const DEFAULT_WINDOW = "standard";
/** Windows valid for synchronous, streaming chat-completions requests. */
const STREAMABLE_WINDOWS = new Set(["asap", "priority", "standard"]);
/** Display name + price detail per window (docs.valarhq.ai/completion-windows.md). */
const WINDOW_INFO: Record<string, { name: string; detail: string }> = {
	asap: { name: "Now (asap)", detail: "immediate, highest rate" },
	priority: { name: "Priority", detail: "~10 s ceiling, ~25% cheaper than Now" },
	standard: { name: "Standard", detail: "~1 min ceiling, ~50% cheaper than Now" },
};
/** Spelling aliases accepted anywhere a window is read ("now" = the Now tier). */
const WINDOW_ALIASES: Record<string, string> = { now: "asap" };
/** Pi thinking-level keys. pi.setThinkingLevel clamps to model capability. */
const PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** Spelling aliases accepted where a thinking level is read. */
const LEVEL_ALIASES: Record<string, string> = { none: "off" };

/**
 * The `/valar` command — one-stop picker for the two per-session knobs Pi does
 * not cover together: Valar's completion window (cost/latency) and the model's
 * thinking level.
 *
 * - `/valar` — interactive: select completion window (Esc skips), then thinking
 *   level (Esc skips). Picking the current value is a no-op. The thinking step
 *   is offered even when the active model is not Valar's — the level is a
 *   model-level setting; the window step notes it only affects Valar requests.
 * - `/valar <window>` — window only (now|asap|priority|standard)
 * - `/valar <level>` — thinking level only (off|minimal|low|medium|high|xhigh|max)
 * - `/valar <window> <level>` — both; the vocabularies are disjoint, so tokens
 *   are classified independently and may come in any order.
 *
 * Window changes are session-only (they write the in-process env var, which
 * the hook re-reads per request; new sessions default to `standard` again).
 * Thinking changes use pi.setThinkingLevel, which Pi records in session
 * history and restores on resume.
 */

function isValarProvider(baseUrl: string | undefined, provider: string | undefined): boolean {
	if (provider === "valar") return true;
	return !!baseUrl && baseUrl.includes("valarhq.ai");
}

/** Canonical streamable window for a raw token, or undefined when invalid/unset. */
function normalizeWindow(raw: string | undefined): string | undefined {
	const w = (raw ?? "").trim().toLowerCase();
	return STREAMABLE_WINDOWS.has(WINDOW_ALIASES[w] ?? w) ? WINDOW_ALIASES[w] ?? w : undefined;
}

/** The effective window for display: env override (normalized) or the default. */
function currentWindow(): string {
	return normalizeWindow(process.env[ENV_KNOB]) ?? DEFAULT_WINDOW;
}

/** Canonical Pi thinking level for a raw token, or undefined when invalid. */
function normalizeLevel(raw: string): string | undefined {
	const l = LEVEL_ALIASES[raw] ?? raw;
	return PI_THINKING_LEVELS.includes(l) ? l : undefined;
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

		if (requested === "flex") {
			console.warn(
				`[valar-completion-window] ignoring ${ENV_KNOB}=flex: flex is background-only and Valar rejects it on synchronous/streaming requests`,
			);
			return undefined;
		}
		const window = normalizeWindow(requested);
		if (requested && !window) {
			console.warn(
				`[valar-completion-window] ignoring ${ENV_KNOB}="${requested}": not one of now/asap, priority, standard — falling back to Valar's default (Now tier)`,
			);
			return undefined;
		}

		return withCompletionWindow(event.payload, window || DEFAULT_WINDOW);
	});

	// ── /valar picker ────────────────────────────────────────────────────────
	// Minimal structural typing for the command handler context: keeps this
	// file compile-safe without importing pi-tui types (extensions are loaded
	// with types erased; every field below is feature-detected before use).
	interface PickerCtx {
		waitForIdle?: () => Promise<void>;
		thinkingLevel?: string;
		model?: { provider?: string };
		ui?: {
			select?: (title: string, items: string[]) => Promise<string | undefined>;
			notify?: (message: string, level: "info" | "error") => void;
		};
	}

	function notify(ctx: PickerCtx, message: string, level: "info" | "error" = "info"): void {
		ctx.ui?.notify?.(message, level);
	}

	function setWindow(ctx: PickerCtx, window: string): void {
		const info = WINDOW_INFO[window];
		const scoped =
			isValarProvider(undefined, ctx.model?.provider) || !ctx.model
				? ""
				: " (applies to Valar requests only)";
		process.env[ENV_KNOB] = window;
		notify(ctx, `Valar completion window → ${info.name} — ${info.detail}; session only${scoped}`);
	}

	async function setLevel(level: string): Promise<string> {
		await Promise.resolve((pi as unknown as { setThinkingLevel: (l: string) => unknown }).setThinkingLevel(level));
		const effective = (pi as unknown as { getThinkingLevel: () => string }).getThinkingLevel();
		return effective;
	}

	async function pickWindow(ctx: PickerCtx): Promise<void> {
		const current = currentWindow();
		const items = Object.entries(WINDOW_INFO).map(([key, info]) => {
			const suffix = key === current ? "  ← current" : "";
			return `${info.name} — ${info.detail}${suffix}`;
		});
		const choice = await ctx.ui.select!("Valar completion window (Esc to skip)", items);
		if (choice === undefined) return;
		const key = Object.keys(WINDOW_INFO).find((k) => choice.startsWith(WINDOW_INFO[k].name));
		if (!key) return;
		if (key === current) {
			notify(ctx, `completion window stays ${WINDOW_INFO[current].name}`);
			return;
		}
		setWindow(ctx, key);
	}

	async function pickThinking(ctx: PickerCtx): Promise<void> {
		const current = ctx.thinkingLevel ?? (pi as unknown as { getThinkingLevel: () => string }).getThinkingLevel();
		const items = PI_THINKING_LEVELS.map((l) => `${l}${l === current ? "  ← current" : ""}`);
		const choice = await ctx.ui.select!("Thinking level (Esc to skip)", items);
		if (choice === undefined) return;
		const level = normalizeLevel(choice.trim());
		if (!level || level === current) return;
		const effective = await setLevel(level);
		notify(
			ctx,
			`Thinking level → ${effective}${effective !== level ? ` (requested ${level}, clamped to model capability)` : ""}`,
		);
	}

	async function applyTokens(ctx: PickerCtx, tokens: string[]): Promise<void> {
		for (const token of tokens) {
			const window = normalizeWindow(token);
			const level = normalizeLevel(token);
			if (token === "flex") {
				notify(
					ctx,
					"flex is background-only: Valar rejects it on synchronous/streaming requests (use priority or standard)",
					"error",
				);
			} else if (window) {
				if (currentWindow() !== window) setWindow(ctx, window);
				else notify(ctx, `completion window stays ${WINDOW_INFO[window].name}`);
			} else if (level) {
				const effective = await setLevel(level);
				notify(
					ctx,
					`Thinking level → ${effective}${effective !== level ? ` (requested ${level}, clamped to model capability)` : ""}`,
				);
			} else {
				notify(
					ctx,
					`"${token}" is not a window (now/asap, priority, standard) or level (off..max) — ignored`,
					"error",
				);
			}
		}
	}

	pi.registerCommand("valar", {
		description: "Pick Valar completion window (cost/latency) and thinking level",
		getArgumentCompletions: (prefix: string): Array<{ value: string; label: string }> | null => {
			const p = (prefix ?? "").trim().toLowerCase();
			const items = [
				...Object.entries(WINDOW_INFO).map(([k, i]) => ({ value: k, label: `${i.name} — completion window` })),
				...PI_THINKING_LEVELS.map((l) => ({ value: l, label: `${l} — thinking level` })),
			];
			const filtered = items.filter((i) => i.value.startsWith(p));
			return filtered.length ? filtered : null;
		},
		handler: async (rawArgs: unknown, rawCtx: unknown) => {
			const ctx = rawCtx as PickerCtx;
			if (typeof ctx.waitForIdle === "function") await ctx.waitForIdle();

			const tokens = String(rawArgs ?? "")
				.trim()
				.toLowerCase()
				.split(/\s+/)
				.filter(Boolean);
			if (tokens.length > 0) {
				await applyTokens(ctx, tokens);
				return;
			}

			if (typeof ctx.ui?.select !== "function") {
				notify(
					ctx,
					"No interactive UI in this session — use the argument form: /valar <window> [level] (e.g. /valar priority high)",
					"error",
				);
				return;
			}
			await pickWindow(ctx);
			await pickThinking(ctx);
		},
	});
}
