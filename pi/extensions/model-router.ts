/**
 * Model Router — complexity-tier model selection via TypeSafe's Jev
 * classifier (https://docs.typesafe.ai). Ports the Claude Code
 * `model-router.sh` / `model-router-lib.sh` hooks to Pi's extension system,
 * with the switch that harness couldn't do: pi.setModel() applies the
 * routed model for the session.
 *
 * Classifies only the first user prompt of each session and sends a
 * redacted copy of the prompt — see sanitizePrompt() — since there is no
 * confirmed ZDR/DPA with TypeSafe. Never blocks or rewrites the prompt.
 *
 * Multimodal prompts bypass the classifier: attached images, or an image or
 * `.pdf` filename in the prompt text, route straight to `config.multimodal`
 * (DEFAULT_MULTIMODAL_MODEL when unset). Jev sees redacted text only and
 * answers with one of three fixed tiers, so it cannot weigh visual content.
 * Pi has no PDF attachment channel, and clipboard image paste fails silently
 * on some terminals (WSL/Windows), so files often reach a prompt as a path
 * or filename in the text — which is why detection is textual.
 *
 * Tests: `node ~/.pi/agent/extensions/model-router.test.mts`
 *
 * Requires TYPESAFE_API_KEY. Any missing prerequisite, or any error along
 * the way (network, malformed response, unroutable tier), fails open —
 * the session keeps its current model.
 *
 * Configuration: `model-router.json` one directory up from this file (see keys
 * in ModelRouterConfig). Missing or malformed config falls back to
 * DEFAULT_TIER_TO_MODEL and DEFAULT_MULTIMODAL_MODEL. Model values accept
 * either a bare model id or a provider-qualified "provider/modelId" reference,
 * and must resolve inside the session's scoped models.
 */

import { readFileSync } from "node:fs";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const REQUEST_TIMEOUT_MS = 5000;
const MAX_CHARS = 4000;

const TOKEN_PATTERNS: RegExp[] = [
  /\b(sk|ghp|gho|ghu|ghs|ghr)-[A-Za-z0-9_-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]+\b/g,
  /[Bb]earer +[A-Za-z0-9._-]+/g,
  /\b[A-Za-z0-9_-]{32,}\b/g,
];
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PATH_PATTERNS: RegExp[] = [
  /\/(home|Users|root)\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*/g,
  /[A-Za-z]:[\\/][A-Za-z0-9_. \\/-]+/g,
];
const IP_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

function sanitizePrompt(text: string): string {
  let out = text;
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, "[REDACTED_TOKEN]");
  out = out.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
  for (const pattern of PATH_PATTERNS) out = out.replace(pattern, "[REDACTED_PATH]");
  out = out.replace(IP_PATTERN, "[REDACTED_IP]");
  return out.slice(0, MAX_CHARS);
}

const VALID_TIERS = new Set(["simple", "standard", "complex"]);

// Pi attaches images as content blocks but has no PDF channel, so a PDF only
// ever reaches a prompt as a path or filename in the text. Images also arrive
// as paths when clipboard paste is unavailable or fails silently (e.g. WSL).
// Filenames containing spaces match only their last space-free segment.
const PDF_FILE_PATTERN = /[\w~.+@/\\(),[\]-]+\.pdf\b/gi;
const IMAGE_FILE_PATTERN = /[\w~.+@/\\(),[\]-]+\.(?:png|jpe?g|gif|webp|bmp)\b/gi;

export interface MultimodalEvidence {
  imageCount: number;
  imageNames: string[];
  pdfNames: string[];
}

/** Multimodal evidence in a prompt, or undefined when there is none. */
export function detectMultimodal(
  prompt: string,
  images?: readonly { mimeType: string }[],
): MultimodalEvidence | undefined {
  const imageCount = images?.length ?? 0;
  const imageNames = [
    ...new Set((prompt.match(IMAGE_FILE_PATTERN) ?? []).map((match) => match.split(/[\\/]/).pop() ?? match)),
  ];
  const pdfNames = [
    ...new Set((prompt.match(PDF_FILE_PATTERN) ?? []).map((match) => match.split(/[\\/]/).pop() ?? match)),
  ];
  if (imageCount === 0 && imageNames.length === 0 && pdfNames.length === 0) return undefined;
  return { imageCount, imageNames, pdfNames };
}

function describeMultimodal(evidence: MultimodalEvidence): string {
  const parts: string[] = [];
  if (evidence.imageCount > 0) {
    parts.push(`${evidence.imageCount} attached image${evidence.imageCount === 1 ? "" : "s"}`);
  }
  if (evidence.imageNames.length > 0) parts.push(evidence.imageNames.join(", "));
  if (evidence.pdfNames.length > 0) parts.push(evidence.pdfNames.join(", "));
  return parts.join(" + ");
}

// Complexity tier → model reference within the session's scoped models.
const DEFAULT_TIER_TO_MODEL: Record<string, string> = {
  simple: "valar/moonshotai/Kimi-K3-fast",
  standard: "valar/qwen/qwen3.8-max",
  complex: "valar/zai-org/GLM-5.3",
};

// Model for prompts that need vision or document processing.
export const DEFAULT_MULTIMODAL_MODEL = "azure-claude/claude-opus-5";

interface ModelRouterConfig {
  enabled?: boolean;
  tiers?: Record<string, string>;
  multimodal?: string;
}

export function normalizeConfig(raw: unknown): Required<ModelRouterConfig> {
  const parsed = (raw !== null && typeof raw === "object" ? raw : {}) as ModelRouterConfig;
  return {
    enabled: parsed.enabled ?? true,
    tiers: { ...DEFAULT_TIER_TO_MODEL, ...(parsed.tiers ?? {}) },
    multimodal: parsed.multimodal ?? DEFAULT_MULTIMODAL_MODEL,
  };
}

function loadConfig(): Required<ModelRouterConfig> {
  try {
    return normalizeConfig(JSON.parse(readFileSync(new URL("../model-router.json", import.meta.url), "utf8")));
  } catch {
    return normalizeConfig(null);
  }
}

/** Resolve a "provider/modelId" reference, falling back to a bare model id. */
export function resolveModelRef<T extends { model: { provider: string; id: string } }>(
  ref: string,
  scoped: readonly T[],
): T["model"] | undefined {
  return (
    scoped.find((candidate) => `${candidate.model.provider}/${candidate.model.id}` === ref)?.model ??
    scoped.find((candidate) => candidate.model.id === ref)?.model
  );
}

export default function modelRouterExtension(pi: ExtensionAPI): void {
  const config = loadConfig();

  // Once per session: this extension instance is re-created on new/resume/fork
  // sessions, so a module-scoped flag mirrors the bash version's per-session
  // state file gate.
  let classified = false;

  pi.on("before_agent_start", async (event, ctx) => {
    if (classified || !config.enabled) return;
    classified = true;

    // Switch to a routed model and report the outcome. Every failure path keeps
    // the current model and says why.
    async function applyRoute(targetRef: string, label: string, reason: string, note: string): Promise<void> {
      const target = resolveModelRef(targetRef, ctx.scopedModels);
      if (!target) {
        ctx.ui.notify(`${label}: ${reason}, but ${targetRef} is not in the scoped models — keeping current model.`, "warning");
        return;
      }
      const ref = `${target.provider}/${target.id}`;
      if (ctx.model?.provider === target.provider && ctx.model?.id === target.id) {
        ctx.ui.notify(`${label}: ${reason} — already on ${ref}, no switch.${note ? ` ${note}` : ""}`, "info");
        return;
      }
      const switched = await pi.setModel(target);
      if (!switched) {
        ctx.ui.notify(`${label}: ${reason}, but switching to ${targetRef} failed (auth?) — keeping current model.`, "warning");
        return;
      }
      ctx.ui.notify(`${label}: ${reason} → switched to ${ref}.${note ? ` ${note}` : ""}`, "info");
    }

    const multimodal = detectMultimodal(event.prompt, event.images);
    if (multimodal) {
      await applyRoute(
        config.multimodal,
        "Model Router",
        `multimodal prompt (${describeMultimodal(multimodal)})`,
        "Jev skipped — use /model to override.",
      );
      return;
    }

    const apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) return;

    const prompt = event.prompt;
    if (!prompt) return;

    const sanitized = sanitizePrompt(prompt);
    if (!sanitized) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(TYPESAFE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: sanitized,
          model: "jev-latest",
          questions: {
            model_tier: {
              type: "choice",
              instructions: "Which complexity tier best matches this coding task",
              criteria: {
                simple: "Mechanical, low-complexity: renames, formatting, simple lookups, one-line fixes",
                standard: "Standard implementation: normal feature coding, typical bug fixes, moderate complexity",
                complex: "High-complexity: architecture decisions, deep debugging, multi-file refactors, sustained reasoning",
              },
            },
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) return;

      const data = (await response.json()) as {
        answers?: { model_tier?: { choice?: string; confidence?: string } };
      };
      const tier = data.answers?.model_tier?.choice;
      const confidence = data.answers?.model_tier?.confidence;
      if (!tier || !VALID_TIERS.has(tier)) return;

      await applyRoute(
        config.tiers[tier],
        "Model Router (Jev)",
        `classified as ${tier}-tier (confidence ${confidence ?? "?"})`,
        "Use /model to override.",
      );
    } catch {
      // Fails open: network error, timeout, or malformed response.
      return;
    } finally {
      clearTimeout(timeout);
    }
  });
}
