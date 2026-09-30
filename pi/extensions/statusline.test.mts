/**
 * Tests for statusline.ts. Run: node ~/.pi/agent/extensions/statusline.test.mts
 *
 * Formatter and cost tests call the exported pure functions directly. The
 * footer tests drive the real extension factory against a stub pi/ctx with
 * Date.now and the interval timers faked, so the tick, dispose, and reset
 * behavior is asserted rather than eyeballed in a live session.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import statuslineExtension, { formatCost, formatElapsed, sessionCost } from "./statusline.ts";

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.log(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}

// ── harness ──────────────────────────────────────────────────────────────

function usage(costTotal: number) {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: costTotal },
  };
}

function messageEntry(role: string, msgUsage?: ReturnType<typeof usage>) {
  return {
    type: "message",
    id: "m1",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    message: { role, ...(msgUsage ? { usage: msgUsage } : {}) },
  };
}

function otherEntry(type: string, entryUsage?: ReturnType<typeof usage>) {
  return {
    type,
    id: `e-${type}`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    ...(entryUsage ? { usage: entryUsage } : {}),
  };
}

interface Fixtures {
  /** Current fake time in ms. */
  now: number;
  /** Callbacks registered with the faked setInterval, in registration order. */
  ticks: (() => void)[];
  /** Timer handles not yet cleared. */
  liveTimers: Set<object>;
  /** How many times the faked tui was asked to render. */
  renderRequests: number;
}

const real = { now: Date.now, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };

async function withFixtures<T>(fn: (fx: Fixtures) => Promise<T> | T): Promise<T> {
  const fx: Fixtures = { now: 0, ticks: [], liveTimers: new Set(), renderRequests: 0 };
  Date.now = () => fx.now;
  globalThis.setInterval = ((callback: () => void) => {
    const timer = { unref: () => timer };
    fx.ticks.push(callback);
    fx.liveTimers.add(timer);
    return timer;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = ((timer: object) => {
    fx.liveTimers.delete(timer);
  }) as unknown as typeof clearInterval;
  try {
    return await fn(fx);
  } finally {
    Date.now = real.now;
    globalThis.setInterval = real.setInterval;
    globalThis.clearInterval = real.clearInterval;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * refresh() awaits one real git exec per lookup, so settling the queue takes
 * more macrotask turns than the stubbed-exec tests need. Drain generously.
 */
async function settle(turns = 30) {
  for (let i = 0; i < turns; i += 1) await flush();
}

type FooterComponent = { render: (width: number) => string[]; invalidate: () => void; dispose?: () => void };

/** Stand-in for pi's exec when a test does not care about git. */
const notARepo = async () => ({ code: 128, stdout: "", stderr: "" });

/** Runs the real command, so gitInfo() is exercised against actual git. */
function realExec() {
  return async (command: string, args: string[]) => {
    try {
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        execFile(command, args, (err, out) => (err ? reject(err) : resolve({ stdout: out })));
      });
      return { code: 0, stdout };
    } catch (err) {
      return { code: (err as { code?: number }).code ?? 1, stdout: "" };
    }
  };
}

function makeSession(
  entries: unknown[] = [],
  ctxOverrides: Record<string, unknown> = {},
  exec: (command: string, args: string[]) => unknown = notARepo,
) {
  const handlers: Record<string, (event: unknown, ctx: unknown) => unknown> = {};
  let footerFactory: ((tui: unknown, theme: unknown) => FooterComponent) | undefined;
  let renderRequests = 0;

  const pi = {
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      handlers[event] = handler;
      return () => {};
    },
    exec,
  };

  const ctx = {
    mode: "tui",
    cwd: "/home/dev/projects/widget",
    model: { name: "claude-opus-5" },
    thinkingLevel: "high",
    getContextUsage: () => ({ tokens: 41234, contextWindow: 200000, percent: 20.6 }),
    sessionManager: { getEntries: () => entries },
    ui: {
      setFooter: (factory: unknown) => {
        footerFactory = factory as typeof footerFactory;
      },
    },
    ...ctxOverrides,
  };

  statuslineExtension(pi as never);

  return {
    handlers,
    /** Fires session_start and waits for the queued refresh to settle. */
    start: async (event: unknown = { type: "session_start", reason: "startup" }) => {
      handlers.session_start?.(event, ctx);
      await flush();
      await flush();
      await flush();
    },
    /** Instantiates the registered footer factory against a faked tui/theme. */
    buildFooter: (): FooterComponent => {
      if (!footerFactory) throw new Error("setFooter was never called");
      const tui = {
        requestRender: () => {
          renderRequests += 1;
        },
      };
      const theme = { fg: (_color: string, text: string) => text };
      return footerFactory(tui, theme);
    },
    renders: () => renderRequests,
  };
}

const BILLABLE = [messageEntry("assistant", usage(0.4234)), otherEntry("usage", usage(0.02))];

// ── formatElapsed ────────────────────────────────────────────────────────

console.log("\nformatElapsed");

await test("zero elapsed", () => assert.equal(formatElapsed(0), "0m 00s"));
await test("single-digit seconds are zero-padded", () => assert.equal(formatElapsed(7_000), "0m 07s"));
await test("7m 04s", () => assert.equal(formatElapsed(424_000), "7m 04s"));
await test("59m 59s stays minute-formatted", () => assert.equal(formatElapsed(3_599_000), "59m 59s"));
await test("one hour rolls to h m s", () => assert.equal(formatElapsed(3_600_000), "1h 00m 00s"));
await test("1h 05m 22s pads both parts", () => assert.equal(formatElapsed(3_922_000), "1h 05m 22s"));
await test("hours are not capped at 24", () => assert.equal(formatElapsed(90_000_000), "25h 00m 00s"));
await test("partial seconds round down", () => assert.equal(formatElapsed(1_999), "0m 01s"));
await test("negative elapsed clamps to zero", () => assert.equal(formatElapsed(-5_000), "0m 00s"));

// ── formatCost ───────────────────────────────────────────────────────────

console.log("\nformatCost");

await test("no spend yet", () => assert.equal(formatCost(0), "$0.000"));
await test("sub-cent spend stays visible", () => assert.equal(formatCost(0.0042), "$0.004"));
await test("dollars and cents", () => assert.equal(formatCost(0.4234), "$0.423"));
await test("rounds to thousandths", () => assert.equal(formatCost(12.3456), "$12.346"));
await test("negative total clamps to zero", () => assert.equal(formatCost(-1), "$0.000"));

// ── sessionCost ──────────────────────────────────────────────────────────

console.log("\nsessionCost");

await test("empty session", () => assert.equal(sessionCost([]), 0));
await test("assistant message usage counts", () => {
  assert.equal(sessionCost([messageEntry("assistant", usage(0.25))]), 0.25);
});
await test("toolResult usage counts", () => {
  assert.equal(sessionCost([messageEntry("toolResult", usage(0.01))]), 0.01);
});
await test("toolResult without usage is skipped", () => {
  assert.equal(sessionCost([messageEntry("toolResult")]), 0);
});
await test("user messages never count", () => {
  assert.equal(sessionCost([messageEntry("user", usage(9))]), 0);
});
await test("usage entries count", () => {
  assert.equal(sessionCost([otherEntry("usage", usage(0.02))]), 0.02);
});
await test("compaction usage counts", () => {
  assert.equal(sessionCost([otherEntry("compaction", usage(0.03))]), 0.03);
});
await test("branch summary usage counts", () => {
  assert.equal(sessionCost([otherEntry("branch_summary", usage(0.04))]), 0.04);
});
await test("other entry types are ignored even when they carry usage", () => {
  assert.equal(sessionCost([otherEntry("custom", usage(5)), otherEntry("model_change", usage(5))]), 0);
});
await test("all billable kinds sum together", () => {
  const total = sessionCost([
    messageEntry("assistant", usage(0.25)),
    messageEntry("toolResult", usage(0.01)),
    messageEntry("user"),
    otherEntry("usage", usage(0.02)),
    otherEntry("compaction", usage(0.03)),
    otherEntry("label"),
  ]);
  // Asserted through the formatter: float accumulation moves the raw sum
  // (0.31000000000000005) and pi's footer displays three decimals anyway.
  assert.equal(formatCost(total), "$0.310");
});

// ── footer component ─────────────────────────────────────────────────────

console.log("\nfooter");

await test("setFooter registers a two-line footer", async () => {
  await withFixtures(async (fx) => {
    const session = makeSession(BILLABLE);
    fx.now = 1_000;
    await session.start();
    const lines = session.buildFooter().render(120);
    assert.equal(lines.length, 2, "footer renders two lines");
  });
});

await test("line one shows model, directory, and thinking level", async () => {
  await withFixtures(async (fx) => {
    const session = makeSession(BILLABLE);
    fx.now = 1_000;
    await session.start();
    const [lineOne] = session.buildFooter().render(120);
    assert.match(lineOne, /claude-opus-5/);
    assert.match(lineOne, /projects\/widget/);
    assert.match(lineOne, /⚙ high/);
  });
});

await test("line two shows bar, percent, tokens, cost, and elapsed time", async () => {
  await withFixtures(async (fx) => {
    const session = makeSession(BILLABLE);
    fx.now = 1_000;
    await session.start();
    fx.now = 1_000 + 424_000;
    const [, lineTwo] = session.buildFooter().render(120);
    assert.equal(lineTwo, "██░░░░░░░░ 21% (41k) | $0.443 | ⏱ 7m 04s");
  });
});

await test("elapsed time advances on every tick without a new refresh", async () => {
  await withFixtures(async (fx) => {
    const session = makeSession(BILLABLE);
    fx.now = 0;
    await session.start();
    const footer = session.buildFooter();
    assert.match(footer.render(120)[1], /⏱ 0m 00s/);

    fx.now = 61_000;
    const before = session.renders();
    for (const tick of fx.ticks) tick();
    assert.equal(session.renders(), before + 1, "one tick requests one render");
    assert.match(footer.render(120)[1], /⏱ 1m 01s/, "the re-render shows the new elapsed value");
  });
});

await test("dispose clears the ticker", async () => {
  await withFixtures(async (fx) => {
    const session = makeSession();
    await session.start();
    const footer = session.buildFooter();
    assert.equal(fx.liveTimers.size, 1, "one ticker is live after session_start");
    footer.dispose?.();
    assert.equal(fx.liveTimers.size, 0, "dispose clears it");
  });
});

await test("a later session_start resets the timer and leaves one ticker", async () => {
  await withFixtures(async (fx) => {
    const session = makeSession();
    await session.start();
    const first = session.buildFooter();

    fx.now = 600_000;
    await session.start({ type: "session_start", reason: "resume" });
    const second = session.buildFooter();
    assert.match(second.render(120)[1], /⏱ 0m 00s/, "resume restarts from zero");

    first.dispose?.();
    second.dispose?.();
    assert.equal(fx.liveTimers.size, 0, "each footer owns exactly one ticker");
  });
});

await test("session_shutdown clears the ticker pi leaves undisposed", async () => {
  await withFixtures(async (fx) => {
    const session = makeSession();
    await session.start();
    session.buildFooter();
    session.handlers.session_shutdown?.({ type: "session_shutdown", reason: "quit" }, {});
    assert.equal(fx.liveTimers.size, 0);
  });
});

// ── git branch line (real git, no exec stub) ─────────────────────────────

console.log("\ngit");

await test("line one shows the real branch and diff stats in a dirty repo", async () => {
  const repo = mkdtempSync(`${tmpdir()}/statusline-git-`);
  const git = realExec();
  try {
    await git("git", ["-C", repo, "init", "-q", "-b", "main"]);
    writeFileSync(`${repo}/a.txt`, "hello\n");
    const identity = ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t"];
    await git("git", [...identity, "add", "a.txt"]);
    await git("git", [...identity, "commit", "-qm", "init"]);
    writeFileSync(`${repo}/a.txt`, "hello\nworld\n");

    const session = makeSession([], { cwd: repo }, git);
    await session.start();
    await settle();
    const footer = session.buildFooter();
    const [lineOne] = footer.render(120);
    footer.dispose?.();
    assert.match(lineOne, /\(main \| 1 files \+1\)/, `unexpected branch info: ${lineOne}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

await test("non-repo cwd leaves the branch segment empty", async () => {
  const dir = mkdtempSync(`${tmpdir()}/statusline-nogit-`);
  try {
    const session = makeSession([], { cwd: dir }, realExec());
    await session.start();
    await settle();
    const footer = session.buildFooter();
    const [lineOne] = footer.render(120);
    footer.dispose?.();
    assert.doesNotMatch(lineOne, /\(/, `unexpected parenthesised segment: ${lineOne}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── report ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
