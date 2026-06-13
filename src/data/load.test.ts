import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lineSkeletons } from "./load";

// The fuzzy 诗句 index relies on this property: two same-length lines differing by ONE substitution
// share the (L-1) skeleton formed by deleting the differing position. That's how 「举头望明月」 finds
// the corpus 「举头望山月」 (静夜思).
describe("lineSkeletons (fuzzy 1-edit keys)", () => {
  it("a 1-char substitution shares a skeleton (举头望明月 ↔ 举头望山月)", () => {
    const sa = new Set(lineSkeletons([..."举头望明月"]));
    const shared = lineSkeletons([..."举头望山月"]).filter((s) => sa.has(s));
    expect(shared).toContain("举头望月"); // dropping the differing position (明/山)
  });
  it("produces one skeleton per position", () => {
    expect(lineSkeletons([..."床前明月光"])).toHaveLength(5);
  });
  it("dedupes skeletons from repeated chars", () => {
    expect(lineSkeletons([..."明明"])).toHaveLength(1); // both drops yield 「明」
  });
  it("a fully different same-length line shares NO skeleton", () => {
    const sa = new Set(lineSkeletons([..."春眠不觉晓"]));
    expect(lineSkeletons([..."夜来风雨声"]).some((s) => sa.has(s))).toBe(false);
  });
});

// linesf/ (the 4.4 GB delete-1 fuzzy index) is intentionally NOT deployed in prod, so every fuzzy probe
// 404s. Because it's sharded by skeleton hash, one query fans across many distinct buckets → dozens of
// certain-404 round-trips per session. searchByLine must observe ONE 404 and then stop probing linesf/
// for the rest of the session — WITHOUT disabling exact line search (lines/) and WITHOUT hard-coding
// (a future deploy whose first request succeeds must NOT be latched off). 5xx / network errors are
// transient and must stay retryable. These tests drive searchByLine through a mocked fetch and assert on
// the linesf/ vs lines/ traffic it emits.
describe("searchByLine — linesf/ fuzzy session latch", () => {
  // A real FirstLineRef-shaped hit for the lines/ (exact) layer.
  const exactHit = { p: "li_bai", i: 0, t: "静夜思", f: "wujue" };

  function installFetch(opts: {
    linesf: "404" | "503" | "throw" | "200";
    linesfData?: Record<string, unknown[]>; // skeleton→hits served when linesf is "200" (a deployed index)
    lines?: Record<string, unknown[]>;
  }) {
    const calls: string[] = [];
    const linesData = opts.lines ?? {}; // default: exact layer finds nothing → fuzzy fallback runs
    const fzData = opts.linesfData ?? {};
    const fn = vi.fn(async (input: unknown) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/linesf/")) {
        if (opts.linesf === "throw") throw new Error("network down");
        if (opts.linesf === "200")
          return { ok: true, status: 200, json: async () => fzData, text: async () => JSON.stringify(fzData) };
        const status = opts.linesf === "404" ? 404 : 503;
        return { ok: false, status, json: async () => ({}), text: async () => "" };
      }
      if (url.includes("/lines/")) {
        return { ok: true, status: 200, json: async () => linesData, text: async () => JSON.stringify(linesData) };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" }; // search/ etc.
    });
    vi.stubGlobal("fetch", fn);
    return {
      linesf: () => calls.filter((u) => u.includes("/linesf/")).length,
      lines: () => calls.filter((u) => u.includes("/lines/")).length,
      search: () => calls.filter((u) => u.includes("/search/")).length,
      clear: () => (calls.length = 0),
    };
  }

  const QUERY_A = "举头望明月"; // 5 Han chars → in the fuzzy len-4..10 window; exact finds nothing
  const QUERY_B = "白日依山尽"; // a DIFFERENT 5-char line → different shards (rules out per-bucket caching)

  beforeEach(() => {
    vi.resetModules(); // fresh module instance per test → _linesfUnavailable + caches reset
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("latches on a real 404: first call probes linesf/ exactly once, later calls never touch it", async () => {
    const net = installFetch({ linesf: "404" });
    const { searchByLine } = await import("./load");

    await searchByLine(QUERY_A);
    // The first skeleton 404s and latches; every remaining skeleton in the SAME call short-circuits in
    // loadFzShard — so the session emits ONE certain-404 request, not one per skeleton.
    expect(net.linesf()).toBe(1);

    net.clear();
    await searchByLine(QUERY_B); // different query, different buckets → not just a cache hit
    expect(net.linesf()).toBe(0); // latched → zero further linesf/ traffic this session
    expect(net.lines()).toBeGreaterThan(0); // exact line search is unaffected (degradation is invisible)
  });

  it("does NOT latch on a 5xx (transient): later calls still retry linesf/", async () => {
    const net = installFetch({ linesf: "503" });
    const { searchByLine } = await import("./load");

    await searchByLine(QUERY_A);
    expect(net.linesf()).toBeGreaterThan(0); // it tried

    net.clear();
    await searchByLine(QUERY_A); // a 5xx is never cached → the fuzzy probe retries
    expect(net.linesf()).toBeGreaterThan(0); // NOT latched → still attempts linesf/
  });

  it("does NOT latch on a network error (transient): later calls still retry linesf/", async () => {
    const net = installFetch({ linesf: "throw" });
    const { searchByLine } = await import("./load");

    await searchByLine(QUERY_A);
    expect(net.linesf()).toBeGreaterThan(0);

    net.clear();
    await searchByLine(QUERY_A);
    expect(net.linesf()).toBeGreaterThan(0);
  });

  it("never probes linesf/ when exact already found hits (fuzzy fallback is exact-gated)", async () => {
    // Exact lines/ returns a hit for the whole query → hits.length > 0 → fuzzy never runs, latch or not.
    const net = installFetch({ linesf: "404", lines: { [QUERY_A]: [exactHit] } });
    const { searchByLine } = await import("./load");

    const out = await searchByLine(QUERY_A);
    expect(out.length).toBeGreaterThan(0); // exact hit surfaced
    expect(net.linesf()).toBe(0); // exact succeeded → linesf/ never probed
  });

  it("a SUCCESSFUL linesf/ response never latches: fuzzy works and later calls keep probing (Req: not hard-coded)", async () => {
    // The day linesf/ ships, the first request returns 200 — the latch must stay disarmed so fuzzy keeps
    // working forever. Serve a delete-1 hit under 「举头望月」 (QUERY_A with the 4th char 明 dropped → the
    // shared skeleton of corpus 「举头望山月」, 静夜思). Exact still finds nothing, so the fuzzy path runs.
    const fzHit = { p: "li_bai", i: 0, t: "静夜思", f: "wujue" };
    const net = installFetch({ linesf: "200", linesfData: { "举头望月": [fzHit] } });
    const { searchByLine } = await import("./load");

    const out = await searchByLine(QUERY_A);
    expect(out.length).toBeGreaterThan(0); // the 1-edit fuzzy hit surfaced → the fuzzy path is wired through
    expect(net.linesf()).toBeGreaterThan(0); // it probed linesf/

    net.clear();
    await searchByLine(QUERY_B); // a different query → different buckets, not a cache hit
    expect(net.linesf()).toBeGreaterThan(0); // a 200 NEVER latches → fuzzy stays live for the whole session
  });

  it("emits ZERO linesf/ for queries outside the fuzzy length window (the 4..10 gate keeps certain-404s at 0)", async () => {
    // The fuzzy fallback only fires for 4..10 Han chars. Out-of-window queries must never touch linesf/,
    // independent of the latch — that's part of keeping guaranteed-404 traffic at zero. Exact still runs.
    const net = installFetch({ linesf: "404" });
    const { searchByLine } = await import("./load");

    await searchByLine("举头望"); // 3 Han chars — below the window
    expect(net.linesf()).toBe(0);
    expect(net.lines()).toBeGreaterThan(0); // exact line search still active

    net.clear();
    await searchByLine("床前明月光疑是地上霜举头"); // 12 Han chars — above the window
    expect(net.linesf()).toBe(0);
    expect(net.lines()).toBeGreaterThan(0);
  });

  it("searchPoems confines the degradation to the fuzzy layer (search/ + lines/ keep firing after the latch)", async () => {
    // searchPoems is the real 寻诗 entry point: searchByHead (search/) ∥ searchByLine (lines/ + linesf/).
    // After a 404 latches the fuzzy layer, the parallel prefix/title index (search/) and the exact line
    // index (lines/) must keep working — the user-visible degradation is invisible (Req 3).
    const net = installFetch({ linesf: "404" });
    const { searchPoems } = await import("./load");

    await searchPoems(QUERY_A); // trips the latch via the searchByLine half
    net.clear();
    await searchPoems(QUERY_B); // fresh query
    expect(net.linesf()).toBe(0); // fuzzy layer skipped (latched)
    expect(net.search()).toBeGreaterThan(0); // 寻诗 prefix/诗名 index unaffected
    expect(net.lines()).toBeGreaterThan(0); // exact line index unaffected
  });
});
