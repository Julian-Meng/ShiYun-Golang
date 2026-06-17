# 交接说明 — 作品载入动画 + 大诗人首屏下载进度（2026-06-13）

> 对应 commit：`7f85127`（`feat(ui): 作品载入动画 + 大诗人切片首屏下载进度反馈`）。
> 改动文件（6 个，纯前端）：`src/ui/PoetPanel.tsx`、`src/styles.css`、`src/data/load.ts`、
> `src/data/poetPoemsLoader.ts`、`src/state/store.ts`、`src/data/load.test.ts`。

## 1. 做了什么

**任务一 · 加载动画**：PoetPanel 在 `poems===null` 时，由纯文字「载入作品…」升级为
`<PoemsLoading>`：金色旋转 spinner + shimmer 骨架屏 +（拿到 Content-Length 时）下载进度条。
纯 CSS、零依赖、深色星空 + 金（`--gold`/`--gold-soft`）色系，含 `prefers-reduced-motion` 降级
（spinner 放慢、骨架不闪、进度条无过渡）。

**任务二 · 大诗人首屏 → 选了【方案 A：下载进度反馈】**：
- `load.ts` 新增 `readWithProgress(res, onProgress)`：流式读取 Response body
  （`res.body.getReader()`），按 `Content-Length` 上报 `received/total` 字节；**全部字节收齐后一次性
  `TextDecoder().decode()`**，与 `res.text()` 逐字节等价。
- `loadPoetPoems` 的 **206 Range 分支**改用它（签名新增可选 `onProgress`，向后兼容）。
- 进度经 `store.poetPoemsProgress`（带 `poetId` 防串台）→ PoetPanel 显示「62% · 1.6MB / 2.6MB」。

## 2. 为什么选 A（而非 B / C）

| 方案 | 评估 | 结论 |
|---|---|---|
| **A 下载进度反馈** | 成本低、收益明确：2.6MB 下载有可见百分比/进度条，不再是无尽「载入…」。**收齐后一次性 decode → 没有流式 JSON 解析的正确性风险**（跨 chunk 的多字节 UTF-8 不被截断）。复用既有 fetch/Range 路径，零契约改动。 | **采用** |
| **B 渐进式渲染** | 能让前几十首先出来，但要把 `loadPoetPoems` 的「整体 Promise<PoemRecord[]>」契约改成流式/回调接口 + PoetPanel 增量渲染 + **正确的增量 JSON 数组解析**（用户特别点名的正确性难点）。面/风险都更大；而 A 已给出明确反馈，且运维将上 CF 边缘缓存 `/data/`（第二次访问秒开），增量渲染的边际收益有限。 | **暂不做** |
| **C 诗人内分片** | 把「整诗人切片」再细分（诗人内分页 Range），需改 pipeline（更细的 idx）+ idx.json 结构 + load.ts，且必须向后兼容 + 不破坏 poems RAW/Range 契约 + 不改 charset 编号。成本高。 | **暂不做（仅设计建议）** |

**C 的设计建议（若将来 A/B 不够）**：在 `poems/{bucket}.idx.json` 之外，为超大诗人额外产出一个
「诗人内子区间」索引（如每 N 首一个 `[off,len]`），前端先取第 1 段渲染、滚动到底再取下一段。
关键不可破坏项：① `poems/*.json` 仍 RAW（字节偏移依赖未压缩文件）；② 现有整切片 `[off,len]`
向后兼容（老 idx 仍能整取）；③ charset/编号（`anyTextIndex`）完全不动。属较大改动，非必要不上。

## 3. 运维部署注意事项

**这是纯前端发布（新 JS bundle + CSS），数据零改动** —— 与上一份《整联搜索修复》runbook 不同，
本次**无需重建 lines/、无需重传任何 `/data/`、无 nginx 改动、无缓存失效顾虑**。

1. 标准构建 + 上传（同 `docs/devlog/DEPLOY-2026-06-13-search-fix.md` 的步骤，但**跳过所有数据/lines/ 相关步骤**）：
   ```bash
   cd <repo> && git switch main && git pull && npm ci
   npm run deploy:build          # tsc + vite build → dist/ + precompress(.gz)
   rm -rf dist/data/*_v1_backup  # vite 仍会把 v1 备份拷进 dist,删掉(同上份 runbook 步骤 3.5)
   # 上传 dist/ 到 /var/www/shiyun/dist/(scp,本机无 rsync;$SSH 用真实主机)
   ```
2. **数据未变**：`poems/`、`lines/`、`search/`、`charset/manifest/lexicon/gifts/poets.index` 全部不变 →
   不必重传 `/data/`，也不必 purge `/data/` 边缘缓存。
3. **缓存**：`index.html`（no-cache）+ 内容哈希的 `assets/*.js`/CSS → 新前端**立即生效**，无需额外 bust。
4. **契约保持**：`poems/*.json` 仍 RAW、HTTP Range 字节偏移不变（本次只改客户端怎么读 206 响应体，
   未碰 nginx 的 poems 关压缩规则、未碰 linesf/ 404 短路）。
5. **验证**（部署后）：打开一个大诗人（如陆游，南宋 10565 首）首次加载（或 DevTools 限速）→
   应看到金色 spinner + 进度条「X% · a/bMB」逐步填充；加载完成后正常显示诗目录。
   `prefers-reduced-motion` 用户：spinner 放慢、骨架不闪烁。

## 4. 验证记录

- 新增 3 个单测：`readWithProgress` 流式跨 chunk 解码 + body 回退；`loadPoetPoems` 走 206 Range 时
  流式上报进度且解析正确。
- 全量 **208 测试通过**；`tsc --noEmit` + `vite build` 通过。
- 两轮对抗验证：自测边角 + 独立审查 agent（VERDICT: SHIP，确认 poems RAW/Range 契约未动、
  各回退路径无回归、进度 UI 无串台）。
