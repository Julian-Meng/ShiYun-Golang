# Frontend Rebuild Guide

Everything under `src/three/*` and `src/ui/*` is a **replaceable prototype**. A new frontend
only needs the three stable interfaces below; it never touches `engine.ts` or the pipeline.

## 1. Runtime data API — `src/data/load.ts`

```ts
loadData(base = "/data"): Promise<DataManifest>
// Fetches charset.json + poets.index.json + manifest.json, builds the real
// PoetryDataset, and calls provider.setDataset() — engine math goes live.
// Call once at boot; gate the 3D scene on completion (store.loaded).

getPoets(): PoetRow[]                       // all ~29,300 poets, sorted by poemCount desc
getPoet(id): PoetRow | undefined
loadPoetPoems(id): Promise<PoemRecord[]>    // lazy — fetches the poet's bucket, caches it
searchPoets(query, limit?): PoetRow[]       // substring name match, ranked by output
searchByLine(query): Promise<LineHit[]>     // 诗句 search — first-line index → real poems
loadGifts(): Promise<GiftEdge[]>            // 赠诗 edges [fromId,toId,weight] (lazy, cached)
getManifest(): DataManifest | null          // {n, poetCount, poemCount, buckets, dynCounts}
```
`searchByLine` shards by `fnv32(firstLine)&0xff` (== pipeline `lineBucket`); a `LineHit`
carries `{poetId, poemIdx, title, form, firstLine, poet}` → open the poet & surface `poems[i]`.
```ts
type PoetRow    = { id; name; dynasty; poemCount; clusterSize }
type PoemRecord = { t: title; f: "wujue"|"qijue"|"wulu"|"qilu"|"other"; p: lines[] }
```

## 2. Engine API — `src/engine/engineApi.ts`

```ts
pullAt(form: PullForm, [x,y,z], {lushiOnly?, commonK?}): PulledPoem  // void-pull at a point
//   PullForm = FormId | "ziyou"; form="ziyou" → variable-length 自由格式/词 (splitFree lines)
pointForBabelIndex(form, b, R?): Vec3          // 3D location of a known index (fly-to)
textBabelIndex(form, hanText): {index, digits} | null
// ↑ a REAL poem's catalog index (null unless its length matches the form & chars ∈ 字库)
halfIndex(form, han) / halfIndexAuto(han): HalfIndex | null  // 半编号 of a typed opening
babelCardinality(form) / regulatedCardinality(form): bigint
```
See [ENGINE_API.md](ENGINE_API.md). **First char = most-significant digit** ⇒ a known
opening line pins the high-order index (basis for 半编号 prefix search).

## 3. Star geometry — `src/three/PoetStars.tsx`

```ts
poetPosition(p: PoetRow): [x,y,z]   // deterministic galaxy position (dynasty shell + hash)
```
Used to place a star, a label, or a fly-to target. Dynasty layout/colour come from
`src/data/dynasties.ts` (`DYNASTIES`, `bandRadius`, `DYNASTY_BY_KEY`).

## 4. UI state — `src/state/store.ts` (zustand)

| field | meaning |
|---|---|
| `loaded` | data ready |
| `form` | active poem form (五绝…七律) for void-pulls |
| `hidden: Set<key>` | dynasties filtered out (`toggleDynasty`, `showOnly`, `showAllDynasties`) |
| `selected: PulledPoem` | the last void-pull (random poem) → `PoemPanel` |
| `selectedPoet` / `poetPoems` | clicked/searched poet + their lazy-loaded poems → `PoetPanel` |
| `hoverPoetId` | poet under cursor (shows a label) |
| `speed` | camera speed multiplier (HUD readout) |
| `flyTarget` | `[x,y,z]` the camera tweens toward, then auto-clears |
| `pulls` | recent void-pull markers (`PulledStars`) |

Transient camera transform lives in `FlyControls` refs, NOT the store (no 60fps re-renders).

## 5. Interaction contract (current shell — reimplement as you like)

- **Pointer drag** = look; **WASD / Space / Shift** = fly; **wheel** = speed. Keys are
  ignored while an `<input>` is focused.
- **Click (no drag)** → raycast `picking.pickTargets.poetPoints`:
  - hit a poet (and its dynasty not hidden) → `selectPoet` + `loadPoetPoems` → `PoetPanel`.
  - else → `pullAt(form, point)` → a random poem → `PoemPanel` + a gold marker.
- **Hover** (throttled raycast) → `setHover(poetId)`.
- **Search a poet** → `selectPoet` + `setFlyTarget(poetPosition(p))`.

## 6. Direction notes (locked)

- **Default = random (Babel) generation.** No self-built 平仄/格律. A poem's number is just
  `rank` of its character order (`textBabelIndex` / `pullAt`). The engine's 格律 catalog still
  exists + is tested, but real data ships a DUMMY tone table (`load.ts::dummyLexicon`) and the
  UI runs random-only. "Good poems" come from the real corpus (search), or a future neural
  generator (needs a backend — conflicts with static hosting; deferred).
- **Filters compose in the random library**: `commonK` (常用字 = top-K freq chars, COMMON_K=2500)
  + `lushiOnly` + form, all inside one Babel catalog. 格律 (lushiOnly) currently uses a DUMMY
  tone table; activating REAL 格律 needs the 平仄 data below.
- **Picking**: screen-space + apparent-size gate (`FlyControls.screenPick`) — only a visibly
  bright star under the cursor selects a poet; everything else → random void poem. Names show
  only on hover/select (no persistent labels).
- **Galaxy**: `three/galaxyParams.ts` (BRANCHES/TWIST/ARM_SPREAD) shared by `Galaxy` (backdrop:
  Bruno-Simon arms + bulge + 3-stop colour + differential-rotation shader) and `PoetStars`
  (poets winds onto the same arms; radius still = dynasty). Headless preview can't capture the
  dense additive galaxy — verify density/brightness/framing on a real GPU.

- **格律 is REAL** (done): `pipeline/build-lexicon.mjs` → `public/data/lexicon.json` (平水韵
  via charlesix59, MIT + pinyin-pro tail) → `load.ts` `hydrateLexicon` → real Lexicon;
  `hasRealGelu()` gates the HUD 格律 toggle. **格律 × 常用字 compose** via
  `engineApi.commonLexicon(K)` → tone-valid poems in common chars.
- **自由格式 / 词** (done): a 5th `PullForm="ziyou"` over a radix-(N+W) catalog — see
  ENGINE_API.md. HUD 自由 button; PoemPanel shows 自由目录编号 (no 格律 row); composes with 常用字.
- **诗句 content search** (done): `SearchPanel` 诗人/诗句 tabs. 诗句 → `searchByLine` (真实诗人,
  highlighted in PoetPanel via `store.poetFocus`) + `halfIndexAuto` (半编号, always-on, no data).
- **赠诗 network** (done): `three/GiftLines` (LineSegments from `loadGifts`), HUD 赠诗 toggle,
  `store.showGifts`; selecting a poet lights up their edges, others dim. Lines are 1px (WebGL).
- **Still TODO**: polish (GPU-pick at scale, bloom, per-poet fetch, thicker 赠诗 lines via
  `Line2`); prod brotli + deploy; optional whole-poem/all-lines search index.
