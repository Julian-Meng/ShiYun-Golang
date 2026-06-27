// Loads the real dataset from the Go backend API.
// Original static-file version replaced with REST calls.
import type { Lexicon } from "../engine/engine";
import { setDataset } from "./provider";
import { hydrateLexicon, type LexiconAsset, type GiftEdge, type GiftsAsset } from "./contract";
import { checkCharset, type CharsetCheck } from "./charsetHash";

// API base — configurable via VITE_API_BASE at build time.
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || "/api").replace(/\/+$/, "");

let _realGelu = false;
export const hasRealGelu = (): boolean => _realGelu;

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
  f: string;
  p: string[];
}
export interface DataManifest {
  n: number;
  poetCount: number;
  poemCount: number;
  buckets: string[];
  dynCounts: Record<string, number>;
  poemSidecar?: boolean;
}

let _poets: PoetRow[] = [];
let _byId = new Map<string, PoetRow>();
let _manifest: DataManifest | null = null;
const _poemCache = new Map<string, PoemRecord[]>();

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

export async function loadData(base = API_BASE): Promise<DataManifest> {
  const [charset, poets, manifest, lexAsset] = await Promise.all([
    fetch(`${base}/charset`).then((r) => r.json()),
    fetch(`${base}/poets?limit=50000`).then((r) => r.json()),
    fetch(`${base}/manifest`).then((r) => r.json()),
    fetch(`${base}/lexicon`)
      .then((r) => (r.ok ? (r.json() as Promise<LexiconAsset>) : null))
      .catch(() => null),
  ]);
  _poets = poets;
  _byId = new Map(poets.map((p: PoetRow) => [p.id, p]));
  _manifest = manifest;

  _charsetCheck = checkCharset(
    charset.chars as string,
    typeof charset.hash === "string" ? charset.hash : undefined,
  );
  if (!_charsetCheck.ok) {
    console.error(
      `[诗云] 字库与本版本不匹配:编号链接可能错位。computed=${_charsetCheck.computed} ` +
        `expected=${_charsetCheck.expected} file=${_charsetCheck.fileHash ?? "(none)"}`,
    );
  }
  const chars = [...(charset.chars as string)];
  const lexicon = lexAsset ? hydrateLexicon(lexAsset) : dummyLexicon(charset.n);
  _realGelu = !!lexAsset;
  setDataset({ lexicon, charset: chars });
  return manifest;
}

export async function readWithProgress(
  res: Response,
  onProgress?: (received: number, total: number) => void,
): Promise<string> {
  const total = Number(res.headers.get("Content-Length")) || 0;
  const reader = res.body?.getReader?.();
  if (!reader) {
    const txt = await res.text();
    onProgress?.(total, total);
    return txt;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.(received, total);
    }
  }
  const buf = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(buf);
}

export async function loadPoetPoems(
  id: string,
  base = API_BASE,
  onProgress?: (received: number, total: number) => void,
): Promise<PoemRecord[]> {
  const cached = _poemCache.get(id);
  if (cached) return cached;
  const res = await fetch(`${base}/poets/${encodeURIComponent(id)}/poems`);
  if (!res.ok) throw new Error(`poems for ${id} → HTTP ${res.status}`);
  const data = await res.json();
  const poems: PoemRecord[] = data.poems || [];
  _poemCache.set(id, poems);
  onProgress?.(0, 0); // signal completion
  return poems;
}

const HAN_CHAR = /\p{Script=Han}/u;
export async function searchPoets(q: string, limit = 40): Promise<PoetRow[]> {
  const s = q.trim();
  if (!s || !HAN_CHAR.test(s)) return [];
  const res = await fetch(`${API_BASE}/poets?q=${encodeURIComponent(s)}&limit=${limit}`);
  if (!res.ok) return [];
  return res.json();
}

const HAN = /\p{Script=Han}/u;

export interface LineHit {
  poetId: string;
  poemIdx: number;
  title: string;
  form: string;
  firstLine: string;
  poet?: PoetRow;
  lineMatches?: number;
}

/** All "drop one code point" skeletons for fuzzy search (SymSpell-style). */
export function lineSkeletons(cps: string[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < cps.length; i++) out.add(cps.slice(0, i).concat(cps.slice(i + 1)).join(""));
  return [...out];
}

export async function searchByLine(query: string, base = API_BASE): Promise<LineHit[]> {
  const cs = [...query].filter((c) => HAN.test(c));
  if (cs.length < 2) return [];
  const res = await fetch(`${base}/poems/search?q=${encodeURIComponent(query)}&limit=30`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.hits || []) as LineHit[];
}

export async function searchByHead(query: string, base = API_BASE): Promise<LineHit[]> {
  const cs = [...query].filter((c) => HAN.test(c));
  if (!cs.length) return [];
  const res = await fetch(`${base}/poems/search?q=${encodeURIComponent(query)}&limit=30`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.hits || []) as LineHit[];
}

export async function searchPoems(query: string, base = API_BASE): Promise<LineHit[]> {
  const cs = [...query].filter((c) => HAN.test(c));
  if (!cs.length) return [];
  const res = await fetch(`${base}/poems/search?q=${encodeURIComponent(query)}&limit=30`);
  if (!res.ok) return [];
  const data = await res.json();
  const hits = (data.hits || []) as LineHit[];
  // Dedup + cap per poet (server already does this, but belt-and-suspenders)
  const seen = new Set<string>();
  const perPoet = new Map<string, number>();
  const out: LineHit[] = [];
  for (const h of hits) {
    const k = h.poetId + "#" + h.poemIdx;
    if (seen.has(k)) continue;
    seen.add(k);
    const n = perPoet.get(h.poetId) || 0;
    if (n >= 2) continue;
    perPoet.set(h.poetId, n + 1);
    out.push(h);
    if (out.length >= 10) break;
  }
  return out;
}

let _gifts: GiftEdge[] | null = null;
export async function loadGifts(base = API_BASE): Promise<GiftEdge[]> {
  if (_gifts) return _gifts;
  try {
    const r = await fetch(`${base}/gifts`);
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
    /* transient */
  }
  return [];
}
