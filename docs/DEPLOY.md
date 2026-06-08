# Deploy — 诗云 / Poetry Cloud (static, no backend)

The whole app is a static build. **Never add a backend** — all index math + rendering run in the
browser. You ship `dist/` to any static host that supports **HTTP Range** on `poems/*.json`
(nginx, Caddy, most CDNs do).

## 1. Build

```bash
npm ci
node --max-old-space-size=4096 pipeline/build-data.mjs   # regenerate public/data (poems + lines + sidecars)
npm run deploy:build                                     # = npm run build && npm run precompress
```

- `npm run build` runs `tsc --noEmit` then `vite build` → `dist/`. Vite copies `public/` (incl.
  `public/data/`) into `dist/data/`, so the heavy corpora ship as static files.
- `npm run precompress` ([deploy/precompress.mjs](../deploy/precompress.mjs)) writes `.br` + `.gz`
  next to every text asset **except `dist/data/poems/*.json`** (those stay raw — see §3).

**Size:** `dist/data/poems/` ≈ 235 MB, `dist/data/lines/` ≈ 791 MB (compresses well). If your host
caps build size, host `data/` on object storage / a CDN and point `loadData(base)` /
`loadPoetPoems(id, base)` at it (the `base` arg already exists for exactly this).

## 2. Serve

Use [deploy/nginx.conf](../deploy/nginx.conf) as a starting point (needs the `ngx_brotli` module for
`brotli_static`; `gzip_static` is built in). Key points:

- **SPA fallback** — 诗云 is a hash-router (`#a=…` / `#p=…`), so `try_files $uri $uri/ /index.html`.
- **Cache** — `/assets/*` (content-hashed) `immutable, max-age=31536000`; `index.html` `no-cache`.
- **Compression** — brotli/gzip for js/css/json **except** `data/poems/` (§3).

## 3. ⚠ The one deploy gotcha: keep `data/poems/*.json` RAW

The per-poet fetch ([load.ts::loadPoetPoems](../src/data/load.ts)) sends `Range: bytes=off-end`,
where `off/len` come from `poems/{bucket}.idx.json` and index the **uncompressed** file. If the host
serves a **compressed** `poems/*.json` (gzip/brotli), a byte Range slices the *compressed* stream →
the bytes don't parse → the client safely falls back to downloading the whole bucket (correct, but
you lose the ~99% egress saving). So:

- Serve `data/poems/*.json` **uncompressed** (the nginx `location /data/poems/` block disables
  gzip/brotli + advertises `Accept-Ranges: bytes`). `precompress.mjs` already skips them.
- `data/lines/*.json` are fetched **whole** (content search) → compress them normally (big win).

Verify after deploy:
```bash
curl -s -D- -o /dev/null -H 'Range: bytes=0-99' https://shiyun.example.com/data/poems/00.json | grep -i '206\|content-range\|content-encoding'
# want: HTTP/.. 206, Content-Range: bytes 0-99/…, and NO Content-Encoding
```

## 4. Smoke test

`npm run preview` serves `dist/` locally (vite preview = sirv, which supports Range) — click a poet,
confirm a `206` in the network panel, and that a shared `#a=<poetId>` / `#p=<form>.<index>` link
restores the right poem on load.
