/**
 * Footer replacement: model + directory + git branch/diff stats + thinking
 * level on line one, context-usage bar with percent/token count + session cost
 * + elapsed session time on line two. Ports `.claude/statusline.sh`'s layout to
 * Pi's `ui.setFooter`, replacing the built-in footer (pwd/tokens/model rows).
 *
 * The timer counts wall-clock time since pi attached to the session: it resets
 * on every `session_start` (startup, new, resume, fork, reload), so time spent
 * with pi closed is never counted. That needs a tick of its own — pi only
 * re-renders on events, and the timer has to advance while the agent idles — so
 * the footer component owns a 1 Hz `tui.requestRender()` interval.
 *
 * Cost sums `usage.cost.total` over exactly the entry kinds pi's built-in
 * footer counts (assistant messages, toolResult messages, `usage` entries,
 * compaction and branch summaries) and formats it the same way (`$x.xxx`).
 *
 * Provider rate-limit usage is not ported: Pi does not expose it to extensions.
 *
 * Tests: `node ~/.pi/agent/extensions/statusline.test.mts`
 */

import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Redraw cadence for the elapsed-time counter. */
const TICK_MS = 1000;

function bar(percent: number): string {
  const filled = Math.min(10, Math.floor(percent / 10));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

/** Minutes and seconds under an hour, hours above it: `7m 04s`, `1h 05m 22s`. */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

/** Thousandths of a dollar, like pi's footer: a sub-cent session stays visible. */
export function formatCost(cost: number): string {
  return `$${Math.max(0, cost).toFixed(3)}`;
}

/** The subset of pi's SessionEntry shape that sessionCost() reads. */
interface UsageBearing {
  type: string;
  usage?: Usage;
  message?: { role?: string; usage?: Usage };
}

export function sessionCost(entries: readonly UsageBearing[]): number {
  let total = 0;
  for (const entry of entries) {
    let usage: Usage | undefined;
    if (entry.type === "message") {
      const role = entry.message?.role;
      if (role === "assistant" || role === "toolResult") usage = entry.message?.usage;
    } else if (entry.type === "usage" || entry.type === "compaction" || entry.type === "branch_summary") {
      usage = entry.usage;
    }
    if (usage) total += usage.cost.total;
  }
  return total;
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
  cost: number;
  startedAt: number;
}

export default function statuslineExtension(pi: ExtensionAPI): void {
  const state: FooterState = {
    modelName: "?",
    dir: "",
    branchInfo: "",
    thinking: "",
    percent: 0,
    tokensK: "?",
    cost: 0,
    startedAt: Date.now(),
  };

  async function refresh(ctx: ExtensionContext): Promise<void> {
    state.modelName = ctx.model?.name ?? "?";
    state.dir = dirName(ctx.cwd);
    state.branchInfo = await gitInfo(pi, ctx.cwd);
    state.thinking = ctx.thinkingLevel ? ` | ⚙ ${ctx.thinkingLevel}` : "";
    state.cost = sessionCost(ctx.sessionManager.getEntries());

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

  // Each footer clears its own ticker on dispose, and pi disposes a custom
  // footer when it replaces one. pi's stop() disposes only its built-in footer,
  // so the newest ticker is cleared on session_shutdown as well. The interval is
  // unref'd, so a path that clears nothing leaves a stray timer rather than a
  // process that refuses to exit.
  let stopTicker: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    state.startedAt = Date.now();
    ctx.ui.setFooter((tui, theme) => {
      const tick = setInterval(() => tui.requestRender(), TICK_MS);
      tick.unref();
      const stop = () => clearInterval(tick);
      stopTicker = stop;
      return {
        render: () => [
          theme.fg("dim", `[${state.modelName}] 📁 ${state.dir}${state.branchInfo}${state.thinking}`),
          theme.fg(
            "dim",
            `${bar(state.percent)} ${Math.round(state.percent)}% (${state.tokensK}) | ${formatCost(
              state.cost,
            )} | ⏱ ${formatElapsed(Date.now() - state.startedAt)}`,
          ),
        ],
        invalidate: () => {},
        dispose: stop,
      };
    });
    scheduleRefresh(ctx);
  });
  pi.on("turn_end", (_event, ctx) => scheduleRefresh(ctx));
  pi.on("agent_end", (_event, ctx) => scheduleRefresh(ctx));
  pi.on("model_select", (_event, ctx) => scheduleRefresh(ctx));
  pi.on("thinking_level_select", (_event, ctx) => scheduleRefresh(ctx));
  pi.on("session_shutdown", () => stopTicker?.());
}
