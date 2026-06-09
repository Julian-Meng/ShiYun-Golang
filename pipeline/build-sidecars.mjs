// 诗云 — standalone Range-sidecar (re)builder.
//
// Why: the committed/regenerated `public/data/poems/*.json` predate the byte-offset sidecars, so
// `manifest.poemSidecar:true` is a LIE — there are no `*.idx.json` files and `loadPoetPoems` falls
// back to a whole-bucket (~0.9 MB) fetch on every poet click. A full `build-data.mjs` run needs the
// corpus + rebuilds 235 MB poems + 791 MB lines; this script ONLY re-emits each existing poems
// bucket canonically + its sidecar (no corpus, seconds not minutes).
//
// Run: node pipeline/build-sidecars.mjs
//
// It re-serialises each bucket with the SAME one-pass body+offset logic as build-data.mjs::writeBucket,
// so the sliced bytes [off, off+len) are exactly the poet's JSON value (`[{t,f,p},…]`), itself valid
// JSON — the client JSON.parses the Range slice directly. Writing body + idx in one pass guarantees
// the offsets match the bytes regardless of key ordering.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const POEMS = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "poems");

// identical serialisation to build-data.mjs::writeBucket → { body, idx }
function serialise(obj) {
  const idx = {};
  let body = "{";
  let off = Buffer.byteLength(body, "utf8"); // bytes before the first key (= 1, the "{")
  let first = true;
  for (const id in obj) {
    const keyPart = (first ? "" : ",") + JSON.stringify(id) + ":";
    const val = JSON.stringify(obj[id]);
    const keyBytes = Buffer.byteLength(keyPart, "utf8");
    const valBytes = Buffer.byteLength(val, "utf8");
    idx[id] = [off + keyBytes, valBytes]; // byte offset + length of the VALUE (the poems array)
    body += keyPart + val;
    off += keyBytes + valBytes;
    first = false;
  }
  body += "}";
  return { body, idx };
}

const files = readdirSync(POEMS).filter((f) => /^[0-9a-f]{2}\.json$/.test(f)); // skip *.idx.json
if (!files.length) {
  console.error(`no poems buckets under ${POEMS} — provision the data first (see HANDOFF).`);
  process.exit(1);
}
console.log(`re-emitting ${files.length} buckets + sidecars in ${POEMS}`);

let totalPoets = 0;
let checked = false;
for (const f of files.sort()) {
  const b = f.slice(0, 2);
  const obj = JSON.parse(readFileSync(join(POEMS, f), "utf8"));
  const { body, idx } = serialise(obj);
  const bodyBuf = Buffer.from(body, "utf8");
  writeFileSync(join(POEMS, `${b}.json`), bodyBuf);
  writeFileSync(join(POEMS, `${b}.idx.json`), JSON.stringify(idx));
  totalPoets += Object.keys(idx).length;

  // self-check the FIRST bucket: slice every entry by its sidecar offset and confirm it JSON.parses
  // back to the same array length the source had — proves the offsets are byte-exact.
  if (!checked) {
    for (const id in idx) {
      const [off, len] = idx[id];
      const slice = bodyBuf.subarray(off, off + len).toString("utf8");
      const parsed = JSON.parse(slice); // throws if offsets are wrong
      if (!Array.isArray(parsed) || parsed.length !== obj[id].length) {
        throw new Error(`self-check FAILED for ${id} in ${b}: slice len ${parsed.length} != ${obj[id].length}`);
      }
    }
    console.log(`  self-check OK on bucket ${b} (${Object.keys(idx).length} poets sliced + parsed)`);
    checked = true;
  }
}
console.log(`done — ${files.length} sidecars written, ${totalPoets} poet entries. manifest.poemSidecar already true.`);
