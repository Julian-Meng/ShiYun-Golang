// 赠诗漫游 (gift-network roaming) — graph helpers over the committed 赠诗 edge list (gifts.json).
// Backs the GiftRoam panel (link list + breadcrumb + path search) and the 3D gift-line hop in FlyControls.
// The raw edges are DIRECTED (giver → receiver); we build an UNDIRECTED adjacency for traversal but keep
// the direction per link so the UI can show 赠出 / 收到 and annotate the dedication poem on out-edges.
import { loadGifts, type PoemRecord } from "./load";

export interface GiftLink {
  other: string; // the connected poet's id
  dir: "out" | "in"; // out = THIS poet dedicated to `other`; in = `other` dedicated to this poet
  w: number; // edge weight (number of dedications)
}

let _adj: Map<string, GiftLink[]> | null = null;
let _ready: Promise<void> | null = null;

/** Load gifts.json (once) and build the adjacency. Idempotent + concurrency-safe. */
export function ensureGiftGraph(): Promise<void> {
  if (_adj) return Promise.resolve();
  if (_ready) return _ready;
  _ready = loadGifts().then((edges) => {
    const adj = new Map<string, GiftLink[]>();
    const seen = new Set<string>(); // dedupe (a,b,dir) — a poet may dedicate several poems to one person
    const add = (a: string, b: string, dir: "out" | "in", w: number) => {
      const k = a + ">" + b + dir;
      if (seen.has(k)) {
        const l = adj.get(a)!.find((x) => x.other === b && x.dir === dir);
        if (l) l.w = Math.max(l.w, w);
        return;
      }
      seen.add(k);
      let l = adj.get(a);
      if (!l) { l = []; adj.set(a, l); }
      l.push({ other: b, dir, w });
    };
    for (const [from, to, w] of edges) { add(from, to, "out", w); add(to, from, "in", w); }
    _adj = adj;
  });
  return _ready;
}

/** This poet's 赠诗 links (strongest first). Empty until ensureGiftGraph() has resolved. */
export function giftLinks(poetId: string): GiftLink[] {
  const l = _adj?.get(poetId);
  return l ? [...l].sort((a, b) => b.w - a.w) : [];
}

export const giftGraphReady = (): boolean => _adj !== null;

/** True if two poets share ANY 赠诗 edge (direction-agnostic) — used to keep the 足迹 line truthful (it
 *  must never draw a straight segment between two poets that aren't actually connected). */
export function giftAdjacent(a: string, b: string): boolean {
  return !!_adj?.get(a)?.some((l) => l.other === b);
}

/** A node's DISTINCT neighbours, strongest edge first then id — a deterministic expansion order so the
 *  path is stable + prefers stronger relationships (not whatever order the edges happened to load in). */
function neighborsSorted(u: string): string[] {
  const links = _adj?.get(u);
  if (!links) return [];
  const w = new Map<string, number>();
  for (const l of links) w.set(l.other, Math.max(w.get(l.other) ?? 0, l.w));
  return [...w.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map((e) => e[0]);
}

/** BFS shortest path (UNDIRECTED — any 赠诗 relationship connects, regardless of giver/receiver) between
 *  two poets, at most `maxHops` edges. Returns the poet-id path INCLUDING both endpoints, or null if
 *  unreachable within the budget. DETERMINISTIC + SYMMETRIC: it searches from the canonical (smaller-id)
 *  endpoint with a sorted expansion order, so A→B and B→A yield the SAME chain (just oriented to the
 *  caller's `from`→`to`) and a stronger intermediary wins ties. The graph is tiny (~4.8k edges) so this
 *  is microseconds even at a 100-hop budget. */
export function giftPath(from: string, to: string, maxHops = 100): string[] | null {
  if (!_adj) return null;
  if (from === to) return [from];
  // canonical search direction → the same chain for A→B and B→A; re-orient to from→to at the end.
  const flip = from > to;
  const s = flip ? to : from;
  const t = flip ? from : to;
  const prev = new Map<string, string>();
  const seen = new Set<string>([s]);
  let frontier = [s];
  for (let hop = 0; hop < maxHops && frontier.length; hop++) {
    const next: string[] = [];
    for (const u of frontier) {
      for (const other of neighborsSorted(u)) {
        if (seen.has(other)) continue;
        seen.add(other);
        prev.set(other, u);
        if (other === t) {
          const path = [t];
          let c = t;
          while (c !== s) { c = prev.get(c)!; path.push(c); }
          path.reverse(); // s → t
          return flip ? path.reverse() : path; // orient to the caller's from → to
        }
        next.push(other);
      }
    }
    frontier = next;
  }
  return null;
}

/** Best-effort: which of the giver's poems is the dedication to `recipientName`? Matches the recipient's
 *  FULL name appearing in a poem title (寄/赠/和/送 + 名). Returns the poemIdx or null. (字号 aliases like
 *  子由→苏辙 — which created some edges — won't match by name; those edges show the link without a poem.) */
export function dedicationPoemIdx(giverPoems: PoemRecord[] | null, recipientName: string): number | null {
  if (!giverPoems || recipientName.length < 2) return null;
  for (let i = 0; i < giverPoems.length; i++) {
    if ((giverPoems[i].t || "").includes(recipientName)) return i;
  }
  return null;
}
