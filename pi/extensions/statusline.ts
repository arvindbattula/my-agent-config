/**
 * Footer replacement: model + directory + git branch/diff stats on line one,
 * context-usage bar with percent/token count and thinking level on line two.
 * Ports `.claude/statusline.sh`'s layout to Pi's `ui.setFooter`, replacing
 * the built-in footer (pwd/tokens/model rows).
 *
 * Cost, session duration, and rate-limit usage are not ported: Pi's
 * extension API (as of @earendil-works/pi-coding-agent 0.87.1) does not
 * expose per-session cost/duration or provider rate-limit data to
 * extensions, unlike Claude Code's statusline hook input.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function bar(percent: number): string {
  const filled = Math.min(10, Math.floor(percent / 10));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

async function gitInfo(pi: ExtensionAPI, cwd: string): Promise<string> {
  const isRepo = await pi.exec("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"]);
  if (isRepo.code !== 0) return "";

  let branch = (await pi.exec("git", ["-C", cwd, "branch", "--show-current"])).stdout.trim();
  if (!branch) {
    branch = (await pi.exec("git", ["-C", cwd, "rev-parse", "--short", "HEAD"])).stdout.trim() || "detached";
  }

  const status = (await pi.exec("git", ["-C", cwd, "status", "--porcelain"])).stdout;
  const changedFiles = status.split("\n").filter((line) => line.trim().length > 0).length;
  if (changedFiles === 0) return ` | (${branch})`;

  const numstat = (await pi.exec("git", ["-C", cwd, "diff", "--numstat", "HEAD"])).stdout;
  let added = 0;
  let removed = 0;
  for (const line of numstat.split("\n")) {
    const [a, r] = line.split("\t");
    if (a && !Number.isNaN(Number(a))) added += Number(a);
    if (r && !Number.isNaN(Number(r))) removed += Number(r);
  }
  let stats = `${changedFiles} files`;
  if (added > 0) stats += ` +${added}`;
  if (removed > 0) stats += ` -${removed}`;
  return ` | (${branch} | ${stats})`;
}

function dirName(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

interface FooterState {
  modelName: string;
  dir: string;
  branchInfo: string;
  thinking: string;
  percent: number;
  tokensK: string;
}

export default function statuslineExtension(pi: ExtensionAPI): void {
  const state: FooterState = {
    modelName: "?",
    dir: "",
    branchInfo: "",
    thinking: "",
    percent: 0,
    tokensK: "?",
  };

  async function refresh(ctx: ExtensionContext): Promise<void> {
    state.modelName = ctx.model?.name ?? "?";
    state.dir = dirName(ctx.cwd);
    state.branchInfo = await gitInfo(pi, ctx.cwd);
    state.thinking = ctx.thinkingLevel ? ` | ⚙ ${ctx.thinkingLevel}` : "";

    const usage = ctx.getContextUsage();
    state.percent = usage?.percent ?? 0;
    state.tokensK = usage?.tokens != null ? `${Math.round(usage.tokens / 1000)}k` : "?";
  }

  // Refreshes serialize so a slow git exec from an earlier event can't
  // overwrite state written by a later one.
  let queue: Promise<void> = Promise.resolve();
  function scheduleRefresh(ctx: ExtensionContext): void {
    queue = queue.then(() => refresh(ctx)).catch(() => {});
  }

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setFooter((_tui, theme) => ({
      render: () => [
        theme.fg("dim", `[${state.modelName}] 📁 ${state.dir}${state.branchInfo}${state.thinking}`),
        theme.fg("dim", `${bar(state.percent)} ${Math.round(state.percent)}% (${state.tokensK})`),
      ],
      invalidate: () => {},
    }));
    scheduleRefresh(ctx);
  });
  pi.on("turn_end", (_event, ctx) => scheduleRefresh(ctx));
  pi.on("agent_end", (_event, ctx) => scheduleRefresh(ctx));
  pi.on("model_select", (_event, ctx) => scheduleRefresh(ctx));
  pi.on("thinking_level_select", (_event, ctx) => scheduleRefresh(ctx));
}
