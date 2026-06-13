// Loads the real Step-3 assets and swaps them into the engine via the provider seam.
// 格律 tone/rhyme data is intentionally absent (default = random per user direction), so
// we build a DUMMY lexicon that satisfies the engine type but is never used for authentic
// 格律 — the UI runs in random (Babel) mode.
import type { Lexicon } from "../engine/engine";
import { setDataset } from "./provider";
import { hydrateLexicon, type LexiconAsset, type FirstLineRef, type GiftEdge, type GiftsAsset } from "./contract";
import { hashStr } from "./dynasties";
import { checkCharset, type CharsetCheck } from "./charsetHash";
import { FAMOUS_POETS } from "./famousPoets";

const FAMOUS_NAMES = new Set(FAMOUS_POETS.map((f) => f.name)); // rank landmark poets first in 诗句 hits

// Where the data shards are served from. Defaults to the same-origin "/data" (100% static, as before).
// Override at BUILD time with VITE_DATA_BASE to point the whole fetch layer elsewhere — an absolute
// CDN/object-storage origin (egress offload, see DEPLOY.md §1.1) or a VERSIONED path like "/data/v2"
// for immutable caching (DEPLOY.md §2.1). Trailing slashes are stripped so "/data/v2/" === "/data/v2"
// (every helper builds `${base}/poems/…` etc.). This is the default for all six fetch helpers below;
// each still takes an explicit `base` param so a caller can override per-call.
const DATA_BASE = ((import.meta.env.VITE_DATA_BASE as string | undefined) || "/data").replace(/\/+$/, "");

let _realGelu = false;
/** True once a real 平仄/平水韵 lexicon is loaded (so the UI can offer the 格律 mode). */
export const hasRealGelu = (): boolean => _realGelu;

// data↔code version guard: set by loadData after recomputing the charset hash. Null until a load
// runs; non-null with ok=false means the served 字库 differs from what this build expects, so every
// shared 编号 permalink may decode to the WRONG poem. App surfaces this as a dismissible warning.
let _charsetCheck: CharsetCheck | null = null;
export const getCharsetCheck = (): CharsetCheck | null => _charsetCheck;

export interface PoetRow {
  id: string;
  name: string;
  dynasty: string;
  poemCount: number;
  clusterSize: number;
}
export interface PoemRecord {
  t: string;
  f: string; // "wujue" | "qijue" | "wulu" | "qilu" | "other"
  p: string[]; // lines
}
export interface DataManifest {
  n: number;
  poetCount: number;
  poemCount: number;
  buckets: string[];
  dynCounts: Record<string, number>;
  poemSidecar?: boolean; // poems/{bucket}.idx.json byte-offset sidecars exist → Range-fetch per poet
}

let _poets: PoetRow[] = [];
let _byId = new Map<string, PoetRow>();
let _manifest: DataManifest | null = null;
const _bucketCache = new Map<string, Record<string, PoemRecord[]>>(); // whole-bucket fallback cache
const _poemCache = new Map<string, PoemRecord[]>(); // per-poet cache (Range path returns one record)
const _idxCache = new Map<string, Record<string, [number, number]> | null>(); // bucket byte-offset sidecar
let _rangeUnsupported = false; // a host that ignores Range (200, not 206) → stop attempting it

export const getPoets = (): PoetRow[] => _poets;
export const getPoet = (id: string): PoetRow | undefined => _byId.get(id);
export const getManifest = (): DataManifest | null => _manifest;

function dummyLexicon(N: number): Lexicon {
  const half = N >> 1;
  const pingList = Uint32Array.from({ length: half }, (_, i) => i);
  const zeList = Uint32Array.from({ length: N - half }, (_, i) => half + i);
  const toneClass = new Int8Array(N);
  for (let i = half; i < N; i++) toneClass[i] = 1;
  const pingRank = new Int32Array(N).fill(-1);
  pingList.forEach((c, i) => (pingRank[c] = i));
  const zeRank = new Int32Array(N).fill(-1);
  zeList.forEach((c, i) => (zeRank[c] = i));
  const GROUPS = Math.min(30, Math.max(1, half));
  const per = Math.max(1, Math.floor(half / GROUPS));
  const rhymeOf = new Int16Array(N).fill(-1);
  const rhymeMembers: Uint32Array[] = [];
  const rhymeRank: Int32Array[] = [];
  for (let q = 0; q < GROUPS; q++) {
    const start = q * per;
    const end = q === GROUPS - 1 ? half : (q + 1) * per;
    const m: number[] = [];
    const rk = new Int32Array(N).fill(-1);
    for (let id = start; id < end; id++) {
      m.push(id);
      rhymeOf[id] = q;
      rk[id] = m.length - 1;
    }
    rhymeMembers.push(Uint32Array.from(m));
    rhymeRank.push(rk);
  }
  return { N, pingList, zeList, pingRank, zeRank, toneClass, rhymeOf, rhymeMembers, rhymeRank };
}

export async function loadData(base = DATA_BASE): Promise<DataManifest> {
  const [charset, poets, manifest, lexAsset] = await Promise.all([
    fetch(`${base}/charset.json`).then((r) => r.json()),
    fetch(`${base}/poets.index.json`).then((r) => r.json()),
    fetch(`${base}/manifest.json`).then((r) => r.json()),
    fetch(`${base}/lexicon.json`)
      .then((r) => (r.ok ? (r.json() as Promise<LexiconAsset>) : null))
      .catch(() => null),
  ]);
  _poets = poets;
  _byId = new Map(poets.map((p: PoetRow) => [p.id, p]));
  _manifest = manifest;
  // data↔code guard: recompute the charset hash from the actual chars (don't trust the file's own
  // hash field alone) and compare to BOTH that field and this build's frozen EXPECTED_CHARSET_HASH.
  // A mismatch means the served 字库 differs from what the code expects → shared 编号 permalinks decode
  // to the WRONG poem. We DON'T hard-block (the cloud still renders), but we log + flag for the UI.
  _charsetCheck = checkCharset(charset.chars as string, typeof charset.hash === "string" ? charset.hash : undefined);
  if (!_charsetCheck.ok) {
    console.error(
      `[诗云] 字库与本版本不匹配:编号链接可能错位。computed=${_charsetCheck.computed} ` +
        `expected=${_charsetCheck.expected} file=${_charsetCheck.fileHash ?? "(none)"}`,
    );
  }
  const chars = [...(charset.chars as string)]; // code-point split (handles astral chars)
  const lexicon = lexAsset ? hydrateLexicon(lexAsset) : dummyLexicon(charset.n);
  _realGelu = !!lexAsset;
  setDataset({ lexicon, charset: chars });
  return manifest;
}

// Failures THROW and are NEVER cached. The old `.catch(() => ({}))` silently latched an empty
// object into the cache on any transient network hiccup — that poet then rendered as "0 poems"
// forever (no error, no retry could help). A thrown rejection instead reaches fetchPoetPoems's
// catch → the PoetPanel error + 重试 row.
async function loadBucketWhole(bucket: string, base: string): Promise<Record<string, PoemRecord[]>> {
  let obj = _bucketCache.get(bucket);
  if (!obj) {
    const r = await fetch(`${base}/poems/${bucket}.json`);
    if (!r.ok) throw new Error(`poems bucket ${bucket} → HTTP ${r.status}`);
    obj = (await r.json()) as Record<string, PoemRecord[]>;
    _bucketCache.set(bucket, obj); // only SUCCESS is cached
  }
  return obj;
}

// Egress saver (#12): a poet's poems are a few KB, but a bucket is ~0.9 MB. With the byte-offset
// sidecar (poems/{bucket}.idx.json), fetch ONLY this poet's slice via an HTTP Range request. The
// .json stays one valid JSON object, so we transparently fall back to the whole bucket when the
// sidecar is absent (old data) or the host ignores Range (returns 200 instead of 206).
export async function loadPoetPoems(id: string, base = DATA_BASE): Promise<PoemRecord[]> {
  const cached = _poemCache.get(id);
  if (cached) return cached;
  const bucket = id.slice(0, 2);

  if (_manifest?.poemSidecar && !_rangeUnsupported) {
    let idx = _idxCache.get(bucket);
    if (idx === undefined) {
      try {
        const r = await fetch(`${base}/poems/${bucket}.idx.json`);
        // 404 genuinely means "no sidecar in this dataset" → latch null (whole-bucket from now on).
        // A 5xx / other non-ok status is transient and must NOT be latched — next attempt retries.
        // A NETWORK failure must NOT be latched either — next attempt should try the sidecar again.
        if (r.ok) {
          const fetched = (await r.json()) as Record<string, [number, number]>;
          _idxCache.set(bucket, fetched);
          idx = fetched;
        } else if (r.status === 404) {
          _idxCache.set(bucket, null); // genuinely no sidecar → whole-bucket from now on
          idx = null;
        } else {
          idx = null; // transient (5xx etc.) — skip Range this attempt, don't poison the cache
        }
      } catch {
        idx = null; // transient — skip Range this attempt, don't poison the cache
      }
    }
    const ent = idx?.[id];
    if (ent) {
      const [off, len] = ent;
      try {
        const res = await fetch(`${base}/poems/${bucket}.json`, {
          headers: { Range: `bytes=${off}-${off + len - 1}` },
        });
        if (res.status === 206) {
          const txt = await res.text();
          try {
            const poems = JSON.parse(txt) as PoemRecord[]; // the slice IS valid JSON
            _poemCache.set(id, poems);
            return poems;
          } catch {
            // 206 but the bytes don't parse — e.g. the host serves Range over a gzip stream, so the
            // offsets (computed on the uncompressed file) are meaningless. Stop trying Range and use
            // the whole (transparently-decompressed) bucket from here on.
            _rangeUnsupported = true;
          }
        } else if (res.ok) {
          // host ignored Range → it sent the whole bucket; use it + stop trying Range from now on.
          _rangeUnsupported = true;
          const obj = JSON.parse(await res.text()) as Record<string, PoemRecord[]>;
          _bucketCache.set(bucket, obj);
          const poems = obj[id] || [];
          _poemCache.set(id, poems);
          return poems;
        }
      } catch {
        /* transient network hiccup → fall back to the whole bucket below (don't latch off Range) */
      }
    }
  }

  const obj = await loadBucketWhole(bucket, base);
  const poems = obj[id] || [];
  // a VALID bucket without this id = index↔buckets desync (the data-provisioning bug class)
  if (!poems.length) console.warn(`poet ${id}: bucket ${bucket} loaded but has no entry (data desync?)`);
  _poemCache.set(id, poems);
  return poems;
}

// Author search: substring match on name, ranked by poemCount, capped. Poet names are Han, so a
// digit/latin-only query is ignored — otherwise typing "1"/"2" surfaces the corpus's same-name
// disambiguation suffixes (张生1 / 张生2 …, 13 such names in 29,808) as noise.
const HAN_CHAR = /\p{Script=Han}/u;
export function searchPoets(q: string, limit = 40): PoetRow[] {
  const s = q.trim();
  if (!s || !HAN_CHAR.test(s)) return [];
  const out: PoetRow[] = [];
  for (const p of _poets) {
    if (p.name.includes(s)) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// ── Content search (诗句 → 真实诗): ANY-line index, sharded by content hash (256 buckets,
//    matching the pipeline's lineBucket). 床前明月光 / 疑是地上霜 → 李白《静夜思》. Lazy, like poems/. ──
const HAN = /\p{Script=Han}/u;
const lineBucket = (s: string) => (hashStr(s) & 0xff).toString(16).padStart(2, "0");
const fzBucket = (s: string) => (hashStr(s) & 0xfff).toString(16).padStart(3, "0"); // 4096 fuzzy shards
const _flShard = new Map<string, Record<string, FirstLineRef[]>>();
async function loadFlShard(bucket: string, base: string): Promise<Record<string, FirstLineRef[]>> {
  const cached = _flShard.get(bucket);
  if (cached) return cached;
  // Only cache a SUCCESS (r.ok) or a genuine 404 (shard absent in this dataset). A 5xx / network
  // failure returns empty for THIS call but stays uncached so the next call retries (else search
  // silently returns nothing until reload).
  try {
    const r = await fetch(`${base}/lines/${bucket}.json`);
    if (r.ok) {
      const obj = (await r.json()) as Record<string, FirstLineRef[]>;
      _flShard.set(bucket, obj);
      return obj;
    }
    if (r.status === 404) _flShard.set(bucket, {});
  } catch {
    /* transient — leave cache unset so the next call retries */
  }
  return {};
}

// fuzzy (delete-1 skeleton) shards — linesf/{bucket}.json — for mid-line 异文 search (build-fuzzy.mjs).
// Absent on a worktree that hasn't run `npm run build:fuzzy` → fetch returns {} → fuzzy simply no-ops.
const _fzShard = new Map<string, Record<string, FirstLineRef[]>>();
// Session-level "linesf/ is absent" latch. The fuzzy index is sharded by skeleton hash, so ONE user
// query fans a delete-1 lookup across many DISTINCT buckets — and linesf/ is intentionally not deployed
// in prod (~4.4 GB), so every one of those is a certain 404. The per-bucket cache above can't collapse
// them (each bucket is its own miss), so a single session would otherwise emit dozens of guaranteed-404
// round-trips — the dominant share of prod 404 noise + needless CF origin pulls. Once we've ACTUALLY
// observed a 404 we know the whole prefix is unserved → latch and stop probing linesf/ for the session.
// Latched on a real observed 404 only (never hard-coded): the day linesf/ ships, the first request
// succeeds and the latch never trips, so fuzzy comes back automatically.
let _linesfUnavailable = false;
async function loadFzShard(bucket: string, base: string): Promise<Record<string, FirstLineRef[]>> {
  if (_linesfUnavailable) return {}; // a 404 was already observed this session → don't re-probe linesf/
  const cached = _fzShard.get(bucket);
  if (cached) return cached;
  try {
    const r = await fetch(`${base}/linesf/${bucket}.json`);
    if (r.ok) {
      const obj = (await r.json()) as Record<string, FirstLineRef[]>;
      _fzShard.set(bucket, obj);
      return obj;
    }
    // A genuine 404 = linesf/ isn't served at all (not built / not deployed): cache this bucket empty AND
    // latch the session so no further bucket is even attempted. A 5xx / network error is transient — it
    // returns empty for THIS call but does NOT latch or cache, so the next call still retries.
    if (r.status === 404) {
      _fzShard.set(bucket, {});
      _linesfUnavailable = true;
    }
  } catch {
    /* transient — leave the latch off + cache unset so the next call retries */
  }
  return {};
}
/** All "drop one code point" skeletons of a line's Han chars (SymSpell-style 1-edit lookup key set). */
export function lineSkeletons(cps: string[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < cps.length; i++) out.add(cps.slice(0, i).concat(cps.slice(i + 1)).join(""));
  return [...out];
}

export interface LineHit {
  poetId: string;
  poemIdx: number;
  title: string;
  form: string;
  firstLine: string;
  poet?: PoetRow;
}
/** Find real poems containing the typed line — EXACT (any line / opening), then a FUZZY 1-edit
 *  fallback (linesf/) so a mid-line variant like 「举头望明月」 still finds 李白《静夜思》 (corpus「山月」). */
export async function searchByLine(query: string, base = DATA_BASE): Promise<LineHit[]> {
  const cs = [...query].filter((c) => HAN.test(c));
  if (cs.length < 2) return [];
  const han = cs.join("");
  const seen = new Set<string>();
  const hits: LineHit[] = [];
  const add = (r: FirstLineRef, firstLine: string) => {
    const k2 = r.p + "#" + r.i;
    if (seen.has(k2)) return;
    seen.add(k2);
    hits.push({ poetId: r.p, poemIdx: r.i, title: r.t, form: r.f, firstLine, poet: _byId.get(r.p) });
  };
  // EXACT: the whole input + common opening-line lengths if the user pasted more
  const cands = new Set<string>([han]);
  for (const k of [7, 6, 5, 4]) if (cs.length > k) cands.add(cs.slice(0, k).join(""));
  for (const key of cands) {
    const shard = await loadFlShard(lineBucket(key), base);
    for (const r of shard[key] || []) add(r, key);
  }
  // FUZZY fallback: only when exact found nothing and the input is a plausible single line (len 4..10).
  // Drop each char of the query → skeletons; a 1-substitution corpus line shares the skeleton that
  // drops the differing position. (No-op if linesf/ wasn't built.) Skipped once the session has latched
  // linesf/ as unavailable — every skeleton would 404, so we don't even compute them (loadFzShard would
  // no-op anyway; this avoids the wasted skeleton work + keeps the certain-404 traffic at zero).
  if (hits.length === 0 && cs.length >= 4 && cs.length <= 10 && !_linesfUnavailable) {
    for (const sk of lineSkeletons(cs)) {
      const shard = await loadFzShard(fzBucket(sk), base);
      for (const r of shard[sk] || []) add(r, han);
    }
  }
  // a longer matched opening is more specific; then landmark poets (so a fuzzy 静夜思 beats a prolific
  // minor poet who happens to share a skeleton); then the more prolific (better-known) poet.
  const fam = (h: LineHit) => (h.poet && FAMOUS_NAMES.has(h.poet.name) ? 1 : 0);
  hits.sort(
    (a, b) =>
      b.firstLine.length - a.firstLine.length ||
      fam(b) - fam(a) ||
      (b.poet?.poemCount || 0) - (a.poet?.poemCount || 0),
  );
  return hits.slice(0, 30);
}

// ── 寻诗 prefix + 诗名 index (search/, built by build-search.mjs) — INCREMENTAL: a single char, a half
//    line, or a poem TITLE matches the moment you type it, instead of only a whole exact line. Two key
//    kinds live in each shard: an EXACT full title (any poem) + a len≤PREFIX_MAX PREFIX of a famous poem's
//    line/title. Sharded by hashStr(key)&0xff (== build-search's fnv32). No-op if search/ wasn't built. ──
const PREFIX_MAX = 3; // mirror build-search.mjs (the client keys on the query's first ≤3 汉字)
const sxBucket = (s: string) => (hashStr(s) & 0xff).toString(16).padStart(2, "0");
const _sxShard = new Map<string, Record<string, FirstLineRef[]>>();
async function loadSxShard(bucket: string, base: string): Promise<Record<string, FirstLineRef[]>> {
  const cached = _sxShard.get(bucket);
  if (cached) return cached;
  // Only cache a SUCCESS or a genuine 404 (search/ not built in this dataset). A 5xx / network
  // failure returns empty for THIS call but stays uncached so the next call retries.
  try {
    const r = await fetch(`${base}/search/${bucket}.json`);
    if (r.ok) {
      const obj = (await r.json()) as Record<string, FirstLineRef[]>;
      _sxShard.set(bucket, obj);
      return obj;
    }
    if (r.status === 404) _sxShard.set(bucket, {});
  } catch {
    /* transient — leave cache unset so the next call retries */
  }
  return {};
}

/** 寻诗 incremental hits: looks up the FULL query (an exact poem title, e.g. 静夜思 / 春江花月夜) AND its
 *  first ≤PREFIX_MAX chars (a line/title prefix, e.g. 举头望 / a single 字) in the prefix index. */
export async function searchByHead(query: string, base = DATA_BASE): Promise<LineHit[]> {
  const cs = [...query].filter((c) => HAN.test(c));
  if (!cs.length) return [];
  const keys = new Set<string>([cs.join(""), cs.slice(0, PREFIX_MAX).join("")]);
  const seen = new Set<string>();
  const hits: LineHit[] = [];
  for (const key of keys) {
    const shard = await loadSxShard(sxBucket(key), base);
    for (const r of shard[key] || []) {
      const k = r.p + "#" + r.i;
      if (seen.has(k)) continue;
      seen.add(k);
      hits.push({ poetId: r.p, poemIdx: r.i, title: r.t, form: r.f, firstLine: key, poet: _byId.get(r.p) });
    }
  }
  return hits;
}

/** The 寻诗 tab search. Merges EXACT-line + fuzzy hits (searchByLine — precise whole-line / 异文) with the
 *  PREFIX + 诗名 hits (searchByHead — single char / half line / title), dedups, ranks famous-first then
 *  poemCount, and caps each poet to ≤2 so one prolific poet can't fill all 10 on a one-char query. */
export async function searchPoems(query: string, base = DATA_BASE): Promise<LineHit[]> {
  const cs = [...query].filter((c) => HAN.test(c));
  if (!cs.length) return [];
  const [head, line] = await Promise.all([
    searchByHead(query, base),
    cs.length >= 2 ? searchByLine(query, base) : Promise.resolve([] as LineHit[]),
  ]);
  const seen = new Set<string>();
  const merged: LineHit[] = [];
  for (const h of [...line, ...head]) {
    // exact-line hits first → they win the dedupe (their firstLine is the precise matched line)
    const k = h.poetId + "#" + h.poemIdx;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(h);
  }
  const fam = (h: LineHit) => (h.poet && FAMOUS_NAMES.has(h.poet.name) ? 1 : 0);
  merged.sort((a, b) => fam(b) - fam(a) || (b.poet?.poemCount || 0) - (a.poet?.poemCount || 0));
  const perPoet = new Map<string, number>();
  const out: LineHit[] = [];
  for (const h of merged) {
    const n = perPoet.get(h.poetId) || 0;
    if (n >= 2) continue; // ≤2 per poet → variety on a single-char query
    perPoet.set(h.poetId, n + 1);
    out.push(h);
    if (out.length >= 10) break;
  }
  return out;
}

// ── 赠诗 network: committed edge list [fromId, toId, weight]; loaded lazily on first toggle. ──
let _gifts: GiftEdge[] | null = null;
export async function loadGifts(base = DATA_BASE): Promise<GiftEdge[]> {
  if (_gifts) return _gifts;
  // Only latch a SUCCESS or a genuine 404 (no gift network in this dataset). A 5xx / network
  // failure returns empty for THIS call but stays uncached so the next call retries.
  try {
    const r = await fetch(`${base}/gifts.json`);
    if (r.ok) {
      const a = (await r.json()) as GiftsAsset;
      _gifts = a?.edges ?? [];
      return _gifts;
    }
    if (r.status === 404) {
      _gifts = [];
      return _gifts;
    }
  } catch {
    /* transient — leave _gifts null so the next call retries */
  }
  return [];
}
