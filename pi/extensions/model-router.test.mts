/**
 * Tests for model-router.ts. Run: node ~/.pi/agent/extensions/model-router.test.mts
 *
 * Routing tests drive the real extension factory (loadConfig() reads the real
 * ../model-router.json); only the Jev HTTP boundary is stubbed.
 */

import assert from "node:assert/strict";

import modelRouterExtension, {
  DEFAULT_MULTIMODAL_MODEL,
  detectMultimodal,
  normalizeConfig,
  resolveModelRef,
} from "./model-router.ts";

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

const OPUS = { provider: "azure-claude", id: "claude-opus-5" };
const KIMI = { provider: "valar", id: "moonshotai/Kimi-K3-fast" };
const GLM = { provider: "valar", id: "zai-org/GLM-5.3" };

function makePi(scopedModels = [{ model: OPUS }, { model: KIMI }, { model: GLM }]) {
  const handlers: Record<string, (event: any, ctx: any) => unknown> = {};
  const setModelCalls: { provider: string; id: string }[] = [];
  const notifications: { message: string; type: string }[] = [];
  const h = {
    setModelCalls,
    notifications,
    model: { provider: "valar", id: "moonshotai/Kimi-K3" } as { provider: string; id: string },
    fire(prompt: string, images?: typeof PNG[]) {
      return handlers["before_agent_start"]?.({ type: "before_agent_start", prompt, images }, ctx);
    },
  };
  const ctx = {
    get model() {
      return h.model;
    },
    scopedModels,
    ui: {
      notify(message: string, type = "info") {
        notifications.push({ message, type });
      },
    },
  };
  const pi = {
    on(event: string, handler: (e: any, c: any) => unknown) {
      handlers[event] = handler;
      return () => delete handlers[event];
    },
    async setModel(model: any) {
      setModelCalls.push({ provider: model.provider, id: model.id });
      return true;
    },
  };
  modelRouterExtension(pi as any);
  return h;
}

function withFakeJev(tier: string, run: (calls: { url: string; body: any }[]) => Promise<void>) {
  return async () => {
    const realFetch = globalThis.fetch;
    const realKey = process.env.TYPESAFE_API_KEY;
    const calls: { url: string; body: any }[] = [];
    globalThis.fetch = (async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        json: async () => ({ answers: { model_tier: { choice: tier, confidence: "high" } } }),
      };
    }) as unknown as typeof fetch;
    process.env.TYPESAFE_API_KEY = "test-key";
    try {
      await run(calls);
      assert.equal(typeof calls[0]?.body?.state, "string", "Jev got a sanitized prompt string");
    } finally {
      globalThis.fetch = realFetch;
      if (realKey === undefined) delete process.env.TYPESAFE_API_KEY;
      else process.env.TYPESAFE_API_KEY = realKey;
    }
  };
}

const PNG = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };

// ── detectMultimodal ─────────────────────────────────────────────────────

await test("attached images count as multimodal", () => {
  assert.deepEqual(detectMultimodal("why is this red?", [PNG]), { imageCount: 1, imageNames: [], pdfNames: [] });
});
await test("empty prompt with a pasted image is still multimodal", () => {
  assert.deepEqual(detectMultimodal("", [PNG, PNG]), { imageCount: 2, imageNames: [], pdfNames: [] });
});
await test("a .pdf filename token counts as multimodal", () => {
  assert.deepEqual(detectMultimodal("summarize report.pdf for me"), {
    imageCount: 0,
    imageNames: [],
    pdfNames: ["report.pdf"],
  });
});
await test("uppercase .PDF and a full path both match", () => {
  assert.deepEqual(detectMultimodal("read /tmp/Q3-deck.PDF, then Q4.pdf"), {
    imageCount: 0,
    imageNames: [],
    pdfNames: ["Q3-deck.PDF", "Q4.pdf"],
  });
});
await test("images and a pdf mention together report both", () => {
  assert.deepEqual(detectMultimodal("compare this to deck.pdf", [PNG]), {
    imageCount: 1,
    imageNames: [],
    pdfNames: ["deck.pdf"],
  });
});
await test("an image path in the prompt counts as multimodal", () => {
  assert.deepEqual(detectMultimodal("analyze /mnt/c/Users/x/Pictures/screenshot.png"), {
    imageCount: 0,
    imageNames: ["screenshot.png"],
    pdfNames: [],
  });
});
await test("uppercase .JPG plus jpeg/webp/bmp/gif variants all match", () => {
  assert.deepEqual(detectMultimodal("compare chart.JPG to plot.jpeg, icon.webp, scan.bmp and anim.gif"), {
    imageCount: 0,
    imageNames: ["chart.JPG", "plot.jpeg", "icon.webp", "scan.bmp", "anim.gif"],
    pdfNames: [],
  });
});
await test("an image filename with spaces matches only its last segment (documented limitation)", () => {
  // Characterization test: the pattern's char class excludes spaces, so
  // "Screenshot 2026-09-24 160845.png" matches as "160845.png". Detection
  // still works; only the reported name is truncated.
  assert.deepEqual(detectMultimodal("look at Screenshot 2026-09-24 160845.png"), {
    imageCount: 0,
    imageNames: ["160845.png"],
    pdfNames: [],
  });
});
await test("bare word png without a file extension is not multimodal", () => {
  assert.equal(detectMultimodal("we removed png export support, clean up the dead code"), undefined);
});
await test("image extension inside a longer identifier or extension is not multimodal", () => {
  assert.equal(detectMultimodal("fix src/png-utils.ts and foo.pngx"), undefined);
});
await test("plain text prompt is not multimodal", () => {
  assert.equal(detectMultimodal("rename handleThing to processThing across the repo"), undefined);
});
await test("bare word pdf without a file extension is not multimodal", () => {
  assert.equal(detectMultimodal("we removed pdf export support, clean up the dead code"), undefined);
});
await test("pdf inside a longer identifier or file extension is not multimodal", () => {
  assert.equal(detectMultimodal("fix src/pdf-parser.ts and foo.pdfx"), undefined);
});

await test("image path prompt switches to opus without calling Jev", async () => {
  const realFetch = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = ((...args: unknown[]) => {
    calls.push(args);
    throw new Error("Jev must not be consulted for multimodal prompts");
  }) as unknown as typeof fetch;
  try {
    const h = makePi();
    await h.fire("analyze /mnt/c/Users/x/Pictures/screenshot.png");
    assert.equal(calls.length, 0, "no fetch during a multimodal prompt");
    assert.deepEqual(h.setModelCalls, [OPUS]);
    assert.ok(
      h.notifications[0].message.includes("screenshot.png"),
      `notification names the image: ${h.notifications[0].message}`,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── normalizeConfig ──────────────────────────────────────────────────────

await test("multimodal key overrides the default", () => {
  assert.equal(normalizeConfig({ multimodal: "azure-claude/claude-sonnet-5" }).multimodal, "azure-claude/claude-sonnet-5");
});
await test("multimodal defaults to opus", () => {
  assert.equal(normalizeConfig({}).multimodal, DEFAULT_MULTIMODAL_MODEL);
  assert.equal(DEFAULT_MULTIMODAL_MODEL, "azure-claude/claude-opus-5");
});
await test("tiers merge over defaults and enabled defaults to true", () => {
  const cfg = normalizeConfig({ tiers: { simple: "valar/x" } });
  assert.equal(cfg.tiers.simple, "valar/x");
  assert.equal(cfg.tiers.complex, "valar/zai-org/GLM-5.3");
  assert.equal(cfg.enabled, true);
});
await test("non-object config input falls back to defaults", () => {
  const cfg = normalizeConfig(null);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.multimodal, DEFAULT_MULTIMODAL_MODEL);
});

// ── resolveModelRef ──────────────────────────────────────────────────────

await test("provider-qualified ref resolves exactly", () => {
  assert.equal(resolveModelRef("azure-claude/claude-opus-5", [{ model: OPUS }, { model: KIMI }]), OPUS);
});
await test("bare model id resolves", () => {
  assert.equal(resolveModelRef("moonshotai/Kimi-K3-fast", [{ model: OPUS }, { model: KIMI }]), KIMI);
});
await test("a ref outside the scope resolves to undefined", () => {
  assert.equal(resolveModelRef("anthropic/claude-opus-5", [{ model: KIMI }]), undefined);
});

// ── routing behaviour (real factory, stubbed network) ────────────────────

await test("image prompt switches to opus without calling Jev", async () => {
  const realFetch = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = ((...args: unknown[]) => {
    calls.push(args);
    throw new Error("Jev must not be consulted for multimodal prompts");
  }) as unknown as typeof fetch;
  try {
    const h = makePi();
    await h.fire("what does this error say?", [PNG]);
    assert.equal(calls.length, 0, "no fetch during a multimodal prompt");
    assert.deepEqual(h.setModelCalls, [OPUS]);
    assert.ok(h.notifications[0].message.includes("multimodal"), `notification names the trigger: ${h.notifications[0].message}`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("pdf prompt switches to opus without calling Jev", async () => {
  const realFetch = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = ((...args: unknown[]) => {
    calls.push(args);
    throw new Error("Jev must not be consulted for multimodal prompts");
  }) as unknown as typeof fetch;
  try {
    const h = makePi();
    await h.fire("turn Q3-deck.pdf into release notes");
    assert.equal(calls.length, 0, "no fetch during a multimodal prompt");
    assert.deepEqual(h.setModelCalls, [OPUS]);
    assert.ok(h.notifications[0].message.includes("Q3-deck.pdf"), `notification names the pdf: ${h.notifications[0].message}`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test(
  "text prompt still goes to Jev and switches to the tier model",
  withFakeJev("complex", async (calls) => {
    const h = makePi();
    await h.fire("redesign the retry layer across three modules");
    assert.equal(calls.length, 1, "text-only prompt is classified by Jev");
    assert.deepEqual(h.setModelCalls, [GLM], "complex tier routes to GLM-5.3");
  }),
);

await test("already on opus: multimodal prompt notifies instead of switching", async () => {
  const h = makePi();
  h.model = OPUS;
  await h.fire("describe this screenshot", [PNG]);
  assert.equal(h.setModelCalls.length, 0);
  assert.ok(h.notifications[0].message.includes("already on"), h.notifications[0].message);
});

await test("opus outside the scope: multimodal prompt warns and keeps the model", async () => {
  const h = makePi([{ model: KIMI }]);
  await h.fire("describe this screenshot", [PNG]);
  assert.equal(h.setModelCalls.length, 0);
  assert.equal(h.notifications[0].type, "warning");
});

await test("routing fires once per session, multimodal prompts included", async () => {
  const realKey = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    const h = makePi();
    await h.fire("first prompt");
    await h.fire("second: look at report.pdf", [PNG]);
    assert.equal(h.setModelCalls.length, 0, "prompt 1 has no Jev key; prompt 2 is behind the once-per-session gate");
    assert.equal(h.notifications.length, 0);
  } finally {
    if (realKey !== undefined) process.env.TYPESAFE_API_KEY = realKey;
  }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`- ${f}`);
  process.exit(1);
}
