# 诗云 / Poetry Cloud — 开发日志 (DEVLOG)

Chronological, newest first. Each entry: commits + what changed + how it was verified. The per-area
"what works" matrix lives in [HANDOFF.md](../HANDOFF.md); this file is the running diary.

Verify gate every entry: `npm run build` (tsc + vite) + `npm test`. **The 3D scene cannot be verified
on the headless preview** (swiftshader: the additive galaxy times out / the r3f Canvas subtree stays
dormant), so all visual/interaction work is build+test-verified here and eyeballed by the user on a
real GPU. Data dirs (`poems/`, `lines/`) are git-ignored — see HANDOFF "data provisioning".

---

## 2026-06-09 — Session: 6th agent (徐志摩 data recovery + 寻诗/探诗 rename + 寻诗 prefix/title search + cluster-centering + guide-line coverage)

Cut from `main` @ `27d3ec5`. A fresh worktree has no heavy data; provisioned poems/lines via junction to the
known-good `epic-sinoussi` worktree + linesf from `inspiring-bhabha`, then TOOK OVER port 5199 (stopped the
5th-agent's stale dev server, restarted from this worktree) per the user. main/other worktrees left untouched.

### 1 — 徐志摩 (and the whole 新诗 set) data LOSS — recovered
- **Symptom**: clicking 徐志摩 loaded no poems (panel still said 「19 首真实作品」 from poets.index).
- **Scope (it was systematic)**: exactly the **508 modern poets** (475 当代 + 33 近现代 = the entire
  yuxqiu/modern-poetry import: 徐志摩/海子/北岛/顾城/戴望舒/洛夫/芒克…) were missing their poem TEXT from BOTH
  `poems/*.json` AND `lines/*.json`, while their `poets.index.json` rows (committed in git) survived. All 29,300
  classical poets + every committed asset (charset/gifts/lexicon/manifest/poets.index) were intact.
- **Root cause**: `build-data.mjs` reads the modern corpus inside a `try/catch` that only WARNS on failure
  (`build-data.mjs:163`). A `poems/` rebuild that didn't ingest modern produced poems/ + lines/ without it,
  while git's `poets.index.json` kept modern from an earlier good build → the two diverged. `inspiring-bhabha`
  (the live 5199) **junctions main's `poems/`**, so main + bhabha were broken identically.
- **Fix (this worktree)**: junctioned `poems/`+`lines/` from `epic-sinoussi` (a COMPLETE copy — all 29,808
  poets incl. modern, with sidecars) → `missing = 0 / 29,808`. Verified live on 5199: 徐志摩 Range-fetch → `206`,
  19 poems《雪花的快乐》; 诗句「轻轻的我走了」→ 徐志摩《再别康桥》. **The source corpus is intact**, so a
  full `build-data.mjs` rerun also recovers it. ⚠ **main's `poems/`/`lines/` are STILL broken** (left untouched
  per the user) — the NEXT worktree cut from main must provision from a good source or regenerate.

### 2 — 诗句 → 寻诗, 造诗 → 探诗 (display rename, logic unchanged)
- The two tab names overlapped in meaning. 「诗句」(find a real poem) → **寻诗**; 「造诗」(compute a poem from an
  index) → **探诗**. Display-only: the internal `Tab` ids stay `"line"`/`"compose"`. (`SearchPanel`, `Onboarding`.)

### 3 — 寻诗 prefix + 诗名 search (incremental) — `pipeline/build-search.mjs` (`npm run build:search`)
- The old 诗句 search keyed only WHOLE lines (hash-bucketed) → a mid-line like 「举头望明月」 found nothing until
  the full line, and there was NO title search. New `search/` index (sharded by `hashStr(key)&0xff`, 256 shards):
    • **EXACT full TITLE for every poem** → 诗名搜索 for ANYONE, incl. an obscure poet's famous piece
      (张若虚《春江花月夜》) — found when the whole title is typed.
    • **len-≤3 PREFIX of a FAMOUS poet's lines + title** → incremental: a single 字, a half line, or a title
      prefix matches as you type. `举头望` → 李白《静夜思》 (mid-line!); `静` → 静夜思; capped 12 famous-first.
  - **Size discipline**: prefix-expanding ALL poems was 0.8–2.9 GB. A poemCount bar can't bound it (prolific
    poets own most poems). Gating PREFIX keys to the 48-name FAMOUS set (≈30 K poems) + exact-title-for-all
    lands **129 MB / 256 shards (~0.5 MB each)** — local-rich, deploy-curatable (lever = FAMOUS list / PREFIX_MAX).
  - **Wiring**: `load.ts::searchByHead` (prefix+title) + `searchPoems` (merges searchByHead with the exact-line
    `searchByLine` + fuzzy, dedups, ranks famous-first, caps ≤2/poet for variety, top 10). 寻诗 tab calls
    `searchPoems`; 探诗's `findReal` still uses `searchByLine`. 纯随机 半编号 section unchanged.
  - Limitation: incremental (prefix) only surfaces the 48 famous poets; a non-famous poem appears via exact
    TITLE (full) or exact LINE (full)/fuzzy. Widen `FAMOUS` in build-search.mjs + rerun to broaden.

### 4 — cluster centering (4a) + guide-line coverage (4b)
- **4a 恒星系偏上**: `positions.poemOffset` tied the planet RADIUS to the poem index (`pow((i+0.5)/P,…)`) while
  the LATITUDE `yd` was also monotonic in the index → small radius at the +y pole, large at the −y pole → a
  lopsided teardrop hanging BELOW the poet, so the cluster centre read as offset toward the TOP of the frame.
  Replaced the radial quantile with a HASHED uniform (same density, decorrelated from latitude) → symmetric
  cloud centred on the poet. Same function backs render/pick/locate/guides → clicks stay aligned.
- **4b 指引线漏诗**: `PoemGuides` drew the FIRST `MAX_LINES=4000` poems → for a >4000-poem poet it dropped the
  outermost planets (the ones most needing a guide). Now SAMPLES uniformly across the whole range (`poemIndexOf`)
  so guides span the entire cluster; ≤4000-poem poets are unchanged (every poem still gets a line).

Verify gate: `npm run typecheck` clean, `npm test` **66/66**, `npm run build` ✓. Data + search HTTP-verified on
5199. **4a/4b are visual — the user eyeballs them on a real GPU (no in-conversation preview, per the user).**

### 5–7 — 产品优化: 行星指引常驻 + 赠诗漫游 (跳跃 / 足迹 / 路径)
After GitHub backup + **syncing main's data** (copied the complete `poems/` into main, rebuilt main `lines/`+`search/`
→ `missing 0/29808`, main no longer broken), built three coupled features. **All build + 66/66; the 3D
interactions need a real-GPU pass (no preview).**

- **5 — 行星指引线常驻 (HUD 指引)**: new `store.guideHold` + HUD toggle. ON → the selected poet's `PoemGuides`
  lines hold full brightness instead of the ~10 s auto-fade; only ONE poet's guides show at a time (they follow
  `selectedPoet`, so picking/hopping to another poet switches them). OFF = the existing one-shot flash.
- **6 — 飞跃赠诗线 (hop to the linked poet)** [user chose 新面板+3D点线]: new **`GiftRoam`** panel (docked
  bottom-left, shown when 赠诗 on) lists the selected poet's 赠答往来 (赠出→/←收到 · 对方 · 对应赠诗) — click a
  row to fly across to that poet. ALSO **3D**: clicking a 赠诗 arc in the scene hops along it — `FlyControls`
  CPU-projects the selected poet's ego-net arcs (same bundled Bézier as `GiftLines`) and picks the nearest within
  16 px on a void click (cheap, click-only). Hopping = `store.hopToPoet` (select + lock-follow + APPEND to trail).
- **7 — 赠诗漫游升级 (breadcrumb + return + path search)**:
    • **足迹/返回线**: `store.giftTrail` = the poets you hopped through; **`GiftTrail.tsx`** draws PERSISTENT
      bright-GOLD return lines between consecutive nodes (≤10 edges; trail capped at 11 nodes), with a pulse. Click
      a 足迹 node (panel) or re-hop to return (the trail trims back). Cleared only on 赠诗 off / 清除 / selecting an
      UNRELATED poet (`selectPoet` resets the trail to `[that poet]`).
    • **对应赠诗标注**: for an out-edge, `giftGraph.dedicationPoemIdx` finds the giver's poem whose title contains
      the recipient's name (best-effort; 字号 aliases like 子由→苏辙 may miss → shows the link without a poem).
      Clicking it flares that planet (`pulseAt`, no lock change).
    • **路径查找**: set 起点/终点 (from the selected poet) → `giftGraph.giftPath` BFS shortest path ≤10 hops over
      the 4 849-edge graph (microseconds; budget raisable) → CYAN path highlight in 3D (`GiftTrail`) + clickable
      result chips to fly along. Verified on real data: 苏轼→苏辙 1跳, 苏轼→纳兰性德 2跳 (苏轼→李之仪→纳兰性德,
      跨宋清), 李白↔徐志摩 无连接 (古典/新诗为不连通分量).
  New: `data/giftGraph.ts` (adjacency + BFS + dedication finder), `three/GiftTrail.tsx`, `ui/GiftRoam.tsx`; store
  gains `giftTrail`/`pathStart`/`pathEnd`/`pathResult` + `hopToPoet`/`clearTrail`/`setPath`; HUD 指引 toggle.

### 8 — 设置菜单 + 指引设置 + 漫游易用性 (+ 编号唯一性 discussion)
**编号唯一性 (discussion only, no change)**: the user noticed `编号 N` means DIFFERENT poems under different 诗体
(五绝=20字 vs 七律=56字 — each form is a SEPARATE fixed-length catalog whose index starts at 0 → overlap → the
same number collides). Verdict: **solvable, no new math needed.** All poems form a countable set, so a single
`ℕ↔诗` bijection exists — and the project ALREADY has one: `engine.anyRank/anyUnrank` (the 自由/任意长 全集编号 over
字库∪break) gives every poem (any form/length) a UNIQUE number. The per-form numbers are convenience sub-catalogs.
Fundamental tradeoff: either the number is longer (a universal length-aware encoding) OR a short per-form number is
only unique WITH its 诗体 tag — length info must live somewhere. Recommended (deferred): treat the 自由 全集编号 as
the canonical id, or always show 编号 with its form. Recorded for a future engine decision.

Then 7 product items (all build + 66/66; visual/interaction need a real-GPU pass):
- **1 指引设置**: `guideHold`→`guideMode`(off/flash/hold) + `guideCoverage`(all/optimized) + `guideSeconds`. 'all' =
  a line to EVERY poem (一首不漏; uncapped — max poet ~8k = cheap); 'optimized' = the round-9 sampled cap. flash =
  show `guideSeconds`s then fade; hold = 常驻. 恢复默认 = flash/optimized/10. (`PoemGuides`, `store`.)
- **2 诗云设置菜单**: new `ui/SettingsMenu.tsx` (⚙设置 in HUD) collects 指引(全套) / 行星 / 赠诗 / 引力, each with
  恢复默认 (+ a 全部恢复默认). The 4 toggles moved OUT of the HUD top bar. 赠诗漫游 stays a separate panel.
- **3 路径查找手填**: GiftRoam path endpoints can be TYPED (reuse `searchPoets` autocomplete) or set 选中, not only
  click-picked.
- **4 弱化往来线**: `store.pathDimEgo` + GiftRoam checkbox → `GiftLines` dims the ego arcs (×0.16) so the cyan path
  /gold trail dominate when finding a route.
- **5 滑动条统一**: shared thin gold `::-webkit-scrollbar` + `scrollbar-color` across all overlay panels.
- **6 赠诗线好点**: hover-highlight — `FlyControls` hover-projects the ego arcs; nearest within 26px sets
  `store.giftHoverId` → `GiftLines` lights that arc (×2.8); the click range is the same generous threshold (22px)
  and clicking the highlighted arc hops. So you SEE what you'll click + hit it easily (was pure luck).
- **7 行星更好点 + 诗名 + 提亮(仅选中)**: the selected poet's cluster now HOLDS the highlight for the WHOLE selection
  (was ~10s) at brighter+larger (`bright 3.4`, `sizeScale 860`, `maxPx 44`) → bigger GPU pick target = easier to
  click; hovering one of its planets shows the poem 《title》 near the cursor (`store.hoverPoem` + `ui/PoemHoverLabel`,
  via hover poem-pick gated to the selected poet). (`PoemOrbits`, `FlyControls`.)

### 9 — 唯一全集编号 (SOLVED) + 真实诗定位 + 设置可拖/亮度 + 搜索宽度
- **唯一全集编号 (the headline fix)**: the per-form catalogs collided (`编号 N` was a DIFFERENT poem in each
  诗体, because each fixed form is its own `[0, N^L)` catalog → overlapping ranges). Unified on the
  **universal `anyRank`** over (chars + LINE-BREAK symbols) as THE displayed 编号 for EVERY poem. Because
  any poem is just a char-and-break sequence and `anyRank` is a bijection over those, a 七绝 and its 自由
  twin are the IDENTICAL symbol run → the IDENTICAL number — so the **dedup is automatic** (no detection
  needed; the user's "自由 复刻 fixed-form → 一首诗两个编号" worry dissolves). Verified on real data: 李白
  《赠汪伦》 → a 127-digit number, identical via the 七绝 path and the 自由 path, reverses to the exact poem,
  and differs from the old 114-digit per-form babelRank. Changes (`engineApi`): `describe` (void-pull),
  `pullByIndex` (reverse — now form-agnostic, infers 诗体 from structure, always in-range), `pulledFromIndex`,
  `halfIndexAuto` (now `anyRank(opening)` — a TRUE prefix of the universal number, kept). UI: 探诗 填字/凭编号,
  PoetPanel 目录, PoemPanel, `permalink` (`#p=<index>`, form dropped) all use the universal index. The per-form
  babelRank/格律 catalogs survive in the engine for spatial scatter + 格律 mode only. **+2 engineApi tests
  (dedup + form-agnostic reverse) → 68 total.** The number is long on purpose ("越长越贴合原著").
- **1 真实诗定位**: when a composed / reverse-looked-up poem IS a real corpus poem (`findReal` now returns
  poetId+poemIdx), its 定位 button flies to that poet's ACTUAL orbiting planet (李白's 赠汪伦) — not a random
  void-scatter point. (`SearchPanel.goReal`; cyan button.)
- **2 设置可拖动**: `SettingsMenu` is now drag-by-header (default below the bar, left of the right-side panels)
  so it never traps behind the 诗人/诗 panels and you can watch the effect live.
- **3 搜索宽度**: 寻诗/探诗 panel `width: min(384px, 100vw-36px)` + overflow-x hidden — fills the space, no
  sideways scroll.
- **4 指引线亮度可调**: `store.guideBrightness` (default 0.7×, lower) + a settings slider (0.2..2×); `PoemGuides`
  scales its colour by a `uBright` uniform.

### Round 8 — fuzzy LINE index (mid-line 异文) + orbit-lock + sustained highlight + guide lines
- **诗句 mid-line variant search (item 1)** — round-7's `findReal` fuzzy only covered COMPOSE; 诗句 search of a
  variant line (「举头望明月」) still missed. New `pipeline/build-fuzzy.mjs` (`npm run build:fuzzy`) builds a
  delete-1 / SymSpell skeleton index `linesf/` (4096 shards, disk-staged so it doesn't OOM): a same-length
  1-substitution shares the (L-1) skeleton with the differing char dropped. `searchByLine` adds a fuzzy
  fallback (when exact = 0, len 4..10) via `lineSkeletons` + `loadFzShard`. `lineSkeletons` has 4 unit tests.
  **Large local index (~4.4 GB, 41 M keys, git-ignored); a DEPLOY needs a curated/server-side fuzzy** (noted).
  - `fb2ad58` **fix**: the per-skeleton cap ranked by poemCount → 李白《静夜思》(1107首) was EVICTED from the shared
    skeleton 举头望月 by hyper-prolific minor poets (王世贞 8009首), so 举头望明月 found noise. Now the cap scores the
    48 landmark poets (`FAMOUS`) far above poemCount (never evicted) + `searchByLine` ranks landmark poets first.
    Verified: 举头望明月 → 李白《静夜思》 #1. **Limitation/lever**: only the 48 landmark poets are protected — a famous
    poem by a non-landmark poet (《春江花月夜》/张若虚, 2首) can still be evicted from a shared skeleton. Widen `FAMOUS`
    in `build-fuzzy.mjs` (+ re-run `npm run build:fuzzy`) to cover more, or move to a curated名篇 table for deploy.
- **Orbit-lock (item 2)** — the lock is now an orbit camera: closer default distance (was too far), DRAG
  rotates the locked view (yaw/pitch, no release), WHEEL zooms (distance); movement keys still release.
  (`FlyControls` `lock` ref + handlers.)
- **Sustained highlight (item 3)** — the highlight now holds FULL brightness (`HOLD_FLARE`) for the whole
  ~10 s then weakens (was flash-then-dim); brighter/larger so the cluster stays legible in the spread field.
- **行星指引 / guide lines (item 4)** — new `three/PoemGuides.tsx`: selecting a poet emits a line to EVERY
  poem it wrote (赠诗-style), self-rotating with the cloud, one-shot ~10 s (grow→hold→fade) then auto-deletes.
- Verified: build + 66/66.

### Round 7 — bigger irregular self-rotating clusters + 10s highlight + camera lock + fuzzy findReal
`874cbba`
- **Clusters too small/local/uniform** (user) → `positions.poemSystemRadius` ~6× (35+13√P; 杜甫→~555);
  `poemOffset` clumpy power-law radius + WIDE jitter (non-uniform) + per-poet ELLIPSOID axes (irregular
  shapes: sphere/ellipse/oblate).
- **Self-rotation**: `poemOmega` + shared `poemClock`; each cloud rotates around its poet. Mirrored in the
  visual shader, the GPU pick shader (clicks still land), and the time-aware `poemPosition` (locate tracks).
- **Highlight (item 1)**: selecting a poet ALWAYS flashes its whole cluster in for ~10 s regardless of the
  行星 toggle (flash-in → hold → fade-out); selected poet star also enlarged ×1.8.
- **Camera lock-follow (item 3)**: `store.lockPoetId/lockPoemIdx` + FlyControls — selecting a poet/planet
  centres + follows it (decoration's faster spin streams past = motion); released by any movement key or a
  look-drag. Wired from 3D click / 诗人 / 诗句 / 目录.
- **Search (item 4)**: `findReal` relaxed to a same-length ≤2-char (≥85%) near-match → popular 静夜思
  「举头望明月」 (corpus「山月」) now flagged as 异文. Mid-line variant *search* still needs the fuzzy line index.
- Verified: build + 62/62.

### Round 6 — clickable planets + 群星 v1 (soft 3D clusters, fade, emphasis)
`05ca09f` (clickable) · `9f57d11` (群星 v1)
- **Click a planet → open its poem**: `gpuPick` renders a 2nd pick layer (poem ids offset by
  `POEM_PICK_BASE`) in the same offscreen pass (depth-tested), click-only; `PickResult={kind:poet|poem}`;
  PoemOrbits registers `pickTargets.poemLayer` + `resolve`. +5 vitest (→62).
- **De-blockify v1**: flat disc → soft near-spherical cluster; selecting flashes/fades the cluster in/out.
  (User then said still too small/blocky-when-all-on → Round 7.)

### Round "planets" — 行星 feature (poems orbit their poet) + 目录/搜索 locate
`60a34a7`
- `three/positions.ts` (poetPosition moved here + poemPosition/poemOffset). `three/PoemOrbits.tsx` + HUD
  **行星** toggle (`store.showAllPoems`): OFF = selected poet's poems; ON = all 857,877. 目录定位 (PoetPanel
  🛸定位) + 诗句 search fly to the exact planet (`store.pulseAt`). Verified build + 57/57 + DOM e2e.

### Fix — dead 诗句 search / real-poem detection (missing `lines/`)
`20a55dd`
- `public/data/lines/` was absent → `searchByLine` found nothing → no real hits + `findReal` failed +
  the void/planet double-location. `pipeline/build-lines.mjs` (`npm run build:lines`) rebuilds it from
  `poems/` (no corpus; per-line cap keeps the most-prolific author). 256 buckets / 9.18M refs. Verified:
  床前明月光 → 李白《静夜思》 → flies to the planet (same spot as 目录).

### Fix — dormant Range egress
`3596841`
- `manifest.poemSidecar:true` but `poems/*.idx.json` absent → whole-bucket (~0.9MB) fetch per poet.
  `pipeline/build-sidecars.mjs` (`npm run build:sidecars`) re-emits each bucket + sidecar. Verified live:
  206 `bytes 12-9787/890706` (~98.9% saved).

### Round 5 — UX: placeholder, centre cross dissolve, fixed port
`17242a3`
- 造诗 placeholder simplified; `poetPosition` centreBlur 0.42→0.5 + coreScat 0.15→0.22; Galaxy disk
  azimuthal+core fill; BULGE 42k→64k. `vite` fixed port 5199 strictPort. Centre confirmed by user on a real GPU.
