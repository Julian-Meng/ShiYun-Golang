// Pre-compress dist/ text assets to .br + .gz so nginx brotli_static / gzip_static can serve them.
// Run AFTER `npm run build`:  node deploy/precompress.mjs   (or: npm run precompress)
//
// SKIPS data/poems/*.json — those are served RAW so HTTP Range (the per-poet fetch) slices the
// uncompressed bytes the sidecar offsets point at. Everything else (incl. lines/, ~791 MB) compresses.
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const DIST = "dist";
const TEXT = /\.(js|mjs|css|json|html|svg|wasm|map)$/;
const POEMS = `${sep}data${sep}poems${sep}`; // served raw for Range
let br = 0, gz = 0, skipped = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!TEXT.test(p) || p.endsWith(".br") || p.endsWith(".gz")) continue;
    if (p.includes(POEMS)) { skipped++; continue; } // raw for Range
    if (st.size < 1024) continue; // not worth compressing
    const buf = readFileSync(p);
    writeFileSync(p + ".br", brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
    writeFileSync(p + ".gz", gzipSync(buf, { level: 9 }));
    br++; gz++;
  }
}

try {
  statSync(DIST);
} catch {
  console.error(`No ${DIST}/ — run \`npm run build\` first.`);
  process.exit(1);
}
walk(DIST);
console.log(`precompressed dist/: ${br} .br + ${gz} .gz written; ${skipped} poems/*.json left RAW for Range.`);
