# Step-3 Data Pipeline (SHIPPED · v2)

`pipeline/build-data.mjs` — a one-shot build-time Node script (runs on the dev machine,
never the server). **v1 2026-06-08 · v2 (sheepzh modern layer + 字库 freeze) 2026-06-10.**
Output → `public/data/`: the small index files are tracked in git, the heavy `poems/` +
`lines/` + `search/` sets are git-ignored (rebuild locally / restore from the GitHub data
backup). See [Data model](#output-actual).

> Run: clone the corpora to **C: (fast NVMe)**, then
> `node --max-old-space-size=4096 pipeline/build-data.mjs && npm run build:lines && npm run build:sidecars && npm run build:search`

> ⚠ **字库 FROZEN by default** (production permalink contract): the script reads the existing
> `public/data/charset.json`, re-emits it byte-identical, and SKIPS any poem containing an
> out-of-字库 char. `REFLOW_CHARSET=1` re-derives the charset — that remaps every 编号 and
> breaks all shared links; only for a deliberate major version.

## Input

[`Werneror/Poetry`](https://github.com/Werneror/Poetry) shallow-cloned to
`<corpus>\Werneror-Poetry` — all-dynasties CSV (`"题目","朝代","作者","内容"`, **Simplified**,
MIT), split into per-dynasty files (宋_1..4, 明_1..4, 清_1..2, + transition buckets).

**现代 新诗 (free verse):** TWO sources, ingested in order with cross-source content dedup:

1. [`yuxqiu/modern-poetry`](https://github.com/yuxqiu/modern-poetry) contemporary set cloned to
   `<corpus>\modern-poetry` (Apache-2.0): **+4,494 poems / +508 poets** — preserved verbatim
   (poem order/idx unchanged from v1).
2. **v2:** [`sheepzh/poetry`](https://github.com/sheepzh/poetry) 汉语现代诗歌语料库 cloned to
   `<corpus>\sheepzh-poetry` (tooling MIT; poem texts author-copyrighted, 非商用):
   **+75,980 poems / +2,849 poets** after (a) content-dedup vs yuxqiu (3,016 dropped),
   (b) junk-folder filter — author must match `^[Han·]{1,8}$` (125 handle/test folders like
   `666_666` dropped), (c) the charset-frozen gate (1,597 poems w/ out-of-字库 chars skipped).
   Layout `data/<作者>_<拼音>/<诗名>.pt`; format `title:`/`date:` headers + blank line + body.
   On Windows, clone needs `core.longpaths` + a `git restore` retry (~10 files with NTFS-invalid
   names like `…?.pt` stay missing — acceptable).

Free verse has no 格律, so every modern poem → form `"other"`; a 民国-era name set → dynasty
`近现代` (matches Werneror), all others → `当代`. Their lines feed the content-search index, so
新诗 is searchable too. **A missing clone FAILS the build loudly** (the git-tracked
`poets.index.json` includes these poets, so rebuilding without them would desync `poems/`+`lines/`
from the index). Intentional opt-outs: `ALLOW_NO_MODERN=1` / `ALLOW_NO_SHEEPZH=1`.

**Simplified is kept as-is — no OpenCC, no chinese-poetry overlay, no 平水韵.** Rationale:
the user direction is default-random generation (not self-built 平仄), and users search/type in
Simplified, so the corpus script = the index script = the search script. (Traditional overlay +
real 平水韵 remain a future option, documented in git history / DATA_CONTRACT.md.)

## Stages

```
read all *.csv (own RFC4180-ish parser, handles quotes/embedded newlines)
 + read modern-poetry contemporary *.json (free verse → form "other", dynasty 近现代/当代)
 → normalizeDynasty   raw 朝代 → canonical key (DYN map; transition buckets → later period)
 → splitLines         content split on [，。！？；、] → bare-Han lines
 → classifyForm       4 lines×5/7 or 8 lines×5/7 → wujue/qijue/wulu/qilu, else "other"
 → charset            union of distinct Han chars, ordered by desc frequency → N
 → aggregate poets    GROUP BY (作者, canonical朝代) → id=FNV(name|dyn), poemCount, clusterSize
 → lineIndex          EVERY line (≥4 chars) → refs, dedup within poem, LINE_CAP=6 per identical line
 → emit               charset.json · poets.index.json · poems/{id[0:2]}.json (256 buckets)
                      · lines/{2-hex}.json (256 shards) · gifts.json · manifest.json
```

## Output (actual)

| file | size | shape | git |
|---|---|---|---|
| `charset.json` | 38 KB | `{n:12877, hash, chars}` (字库 = engine radix N) | tracked |
| `poets.index.json` | 2.6 MB | `PoetRow[]` — **29,808 poets**, sorted by poemCount desc | tracked |
| `gifts.json` | ~126 KB | `{version, edgeCount, edges}` — **4,849 赠诗 edges** | tracked |
| `lexicon.json` | ~146 KB | `LexiconAsset` (real 格律, see below) | tracked |
| `manifest.json` | ~1.5 KB | `{n, poetCount, poemCount, buckets, lineBuckets, giftEdges, dynCounts}` | tracked |
| `poems/{bucket}.json` ×256 | 235 MB total | `{poetId: PoemRecord[]}` — **857,877 poems**, lazy per bucket | **ignored** |
| `lines/{bucket}.json` ×256 | ~791 MB total | `{line: [refs]}` — all-lines search index (see below) | **ignored** |

**Data model:** the five small files (`charset.json`, `poets.index.json`, `lexicon.json`,
`gifts.json`, `manifest.json`) are **tracked in git** so the app boots out of the box. The two
heavy sets — `poems/` (235 MB) and `lines/` (791 MB) — are **git-ignored**; regenerate locally
with `node pipeline/build-data.mjs`. (`N` changed this session, so `lexicon.json` was regenerated
too — it's keyed by 字库.)

Dynasty poet counts: 宋 9496 · 清 8980 · 明 4514 · 唐 2820 · 元 1209 · 近现代 967 · 当代 684 ·
南北朝 434 · 金 269 · 魏晋 252 · 秦汉/隋 84 · 辽 7 · 先秦 8 (诗经/楚辞 mostly 无名氏). 五代十国 = 0
(no 五代 file in Werneror; those poets fall under 唐). 近现代/当代 are inflated by the 新诗 import.

## Lexicon build (real 格律) — `pipeline/build-lexicon.mjs`

Separate one-shot: fetch `charlesix59/chinese_word_rhyme` Pingshui_Rhyme.json (MIT 平水韵;
mostly Simplified — OpenCC `tw→cn` patches stray Traditional) → for each 字库 char emit
`toneClass` (上平/下平→平, 上/去/入→仄; pinyin-pro 1/2声→平,3/4→仄 for the ~5k tail not in
平水韵) + `rhymeOf` (30 平声韵部) → `public/data/lexicon.json` (LexiconAsset, ~146KB/40KB gz).
Result: 平=5758, 仄=7119, all 30 韵部 populated. `load.ts` hydrates it into the real Lexicon.
Deps: `opencc-js`, `pinyin-pro` (devDeps).

## All-lines content index + 赠诗 edges (SHIPPED) — same `build-data.mjs`

Two more outputs are emitted in the same pass (manifest `version: 2`):

```
lines/{2-hex bucket}.json   {line: [{p:poetId, i:poemIdx, t:title, f:form}]}
   ALL-LINES content index (renamed from the old firstline/ — now keys EVERY line, not just
   openings). 256 shards by fnv32(line)&0xff (== frontend hashStr); LINE_CAP=6 refs per identical
   line (caps skew on ultra-common lines); lines of length ≥ 4 chars, deduped within each poem.
   ~791 MB total → **git-ignored**, regenerate locally.
   Powers the 诗句 tab (load.searchByLine): 床前明月光 → 李白《静夜思》 AND a non-first line like
   疑是地上霜 → 李白《静夜思》 now resolves too. (`load.ts` reads from lines/.)
gifts.json                       {version, edgeCount, edges:[[fromId,toId,weight]]}
   赠诗 dedication network. For each title, scan ALL markers (寄/赠/和/次韵/酬/答/呈/送…) and emit
   one edge per DISTINCT recipient (兼寄/兼简 are legitimately multi-edge; no early break, so
   marker order can't drop the primary dedication). findName = greedy-longest known name
   (4→3→2 chars) with a 2-char COMPLETENESS guard: a bare 2-char name is taken only if followed
   by a name-ending char / role-title / punctuation / end, so a longer name or surname+role
   isn't truncated (王介甫↛王介, 李道士↛李道). resolveTarget: bare names SAME-DYNASTY only; a
   curated 号/字→本名 alias table (GIFT_ALIAS, now ~250 entries across ~120 poets — 少陵→杜甫,
   子瞻→苏轼, 香山→白居易, 晦庵→朱熹, 遗山→元好问…) resolves famous references across dynasties,
   which lifts the edge count. **4,849 edges / ~126 KB → tracked in git** (network works out of
   the box). Top edges are real literary friendships: 苏辙→苏轼, 元稹→白居易, 刘禹锡→白居易, 黄庭坚→苏轼.
```

Iterate on gifts/manifest only (reuse the ~1 GB of poems/+lines/): `SKIP_HEAVY=1 node
pipeline/build-data.mjs` — skips re-emitting `poems/` (235 MB) and `lines/` (791 MB) and rebuilds
just the lightweight `gifts.json` / `manifest.json`.

## Known follow-ups

- **Per-poet poem fetch** (vs per-bucket): a click on 陆游 currently pulls his whole bucket
  (~MB). Re-shard finer or one-file-per-poet to cut egress.
- **无名氏 / 佚名** collapse into mega-poets — consider special handling.
- **modern-poet dynasty refinement**: 近现代 vs 当代 is split by a hand-curated 民国 name set; a
  proper birth/death date table would classify the long tail correctly.
- **deploy**: ship the static bundle + brotli `.br` emit + nginx `brotli_static`.
- **thicker 赠诗 lines**: switch arcs to `Line2` so edge weight can drive visible width.
- **GPU pick at scale**: object-picking against ~166k particles for hover/click.

> Whole-poem / non-opening-line search and 字号 resolution are **done** — the index now keys all
> lines, and GIFT_ALIAS resolves famous 号/字 references (see above).
