// 诗云 Step-3 data pipeline (Werneror backbone, Simplified, no OpenCC).
// Reads all dynasty CSVs → emits charset + poet index + per-poet poems (bucketed).
// Run: node --max-old-space-size=4096 pipeline/build-data.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = "C:/corpus/Werneror-Poetry"; // external corpus clone (persists on this machine)
const OUT = fileURLToPath(new URL("../public/data", import.meta.url)); // this project's data dir

// raw 朝代 string → canonical dynasty key (must match src/data/dynasties.ts)
const DYN = {
  先秦: "xianqin",
  秦: "qinhan", 汉: "qinhan",
  魏晋: "weijin", 魏晋末南北朝初: "weijin",
  南北朝: "nanbeichao",
  隋: "sui", 隋末唐初: "tang",
  唐: "tang", 唐末宋初: "tang",
  宋: "song", 宋末金初: "song", 宋末元初: "song",
  辽: "liao",
  金: "jin", 金末元初: "jin",
  元: "yuan", 元末明初: "ming",
  明: "ming", 明末清初: "qing",
  清: "qing", 清末民国初: "jinxiandai", 清末近现代初: "jinxiandai",
  近现代: "jinxiandai", 近现代末当代初: "dangdai", 民国末当代初: "dangdai",
  当代: "dangdai",
};

// minimal RFC4180-ish CSV parser (handles quotes, "" escapes, embedded newlines)
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const HAN = /\p{Script=Han}/u;
const onlyHan = (s) => [...s].filter((c) => HAN.test(c)).join("");
const splitLines = (content) =>
  content.split(/[，。！？；、\s]+/).map(onlyHan).filter(Boolean);

const FORMS = [
  { id: "wujue", lines: 4, per: 5 },
  { id: "qijue", lines: 4, per: 7 },
  { id: "wulu", lines: 8, per: 5 },
  { id: "qilu", lines: 8, per: 7 },
];
function classifyForm(lines) {
  const f = FORMS.find((F) => F.lines === lines.length && lines.every((l) => [...l].length === F.per));
  return f ? f.id : "other";
}

// fast 32-bit FNV-1a → uint32
function fnv32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// 8-hex poet id, bucketed by first 2 hex chars (256 buckets)
const poetId = (name, dyn) => fnv32(name + "|" + dyn).toString(16).padStart(8, "0");
// 2-hex content bucket (256 shards) for the first-line search index
const lineBucket = (s) => (fnv32(s) & 0xff).toString(16).padStart(2, "0");

// 赠诗 markers: title verbs that mark a poem dedicated/replying to another poet. The
// precision guard is that the text AFTER the marker must literally be a known poet NAME
// (so noisy markers like 和/送 can't fabricate edges from common words). Longest first.
const GIFT_MARKERS = [
  "奉和", "奉寄", "奉赠", "奉酬", "次韵", "次韵和", "和答", "酬答", "寄赠",
  "寄", "赠", "贈", "和", "酬", "答", "呈", "简", "簡", "怀", "懷", "忆", "憶",
  "送", "别", "別", "示", "谢", "謝", "贺", "賀", "挽", "悼", "哭",
];
const HONORIFIC = /^[大老君公侯郎中令丞卿使府监太少卫将军相王爷儿子弟兄翁叟生先]+/;
// non-person strings that collide with obscure poet names (places / roles / counters).
const GIFT_STOP = new Set([
  "钱塘","长安","洛阳","江南","江东","江上","西湖","金陵","扬州","成都","襄阳","山中","城南",
  "故人","主人","诸公","先生","使君","明府","山人","居士","道士","上人","长老","将军","刺史",
  "太守","二首","三首","四首","其二","其三","同年","友人","内子","小儿","幼子","门生","座主",
]);

console.log("reading CSVs from", SRC);
const files = readdirSync(SRC).filter((f) => f.endsWith(".csv"));
const freq = new Map(); // char -> count
const poets = new Map(); // id -> {id,name,dynasty,dynastyRaw,count,poems:[]}
const firstLines = new Map(); // firstLine -> [{p:poetId, i:poemIdx, t:title, f:form}]  (search index)
const FL_CAP = 12; // max poems indexed per identical opening (avoid skew on ultra-common lines)
let total = 0;

for (const file of files) {
  const rows = parseCSV(readFileSync(join(SRC, file), "utf8"));
  // header = 题目,朝代,作者,内容
  for (let r = 1; r < rows.length; r++) {
    const [title, dynRaw, author, content] = rows[r];
    if (!author || !content) continue;
    const dyn = DYN[dynRaw] || "unknown";
    const lines = splitLines(content);
    if (lines.length === 0) continue;
    for (const l of lines) for (const ch of l) freq.set(ch, (freq.get(ch) || 0) + 1);
    const id = poetId(author, dyn);
    let p = poets.get(id);
    if (!p) { p = { id, name: author, dynasty: dyn, dynastyRaw: dynRaw, count: 0, poems: [] }; poets.set(id, p); }
    p.count++;
    const f = classifyForm(lines);
    const poemIdx = p.poems.length;
    p.poems.push({ t: title || "", f, p: lines });
    total++;
    // first-line search index (床前明月光 → this poem). Skip 1-char fragments.
    const fl = lines[0];
    if ([...fl].length >= 2) {
      let arr = firstLines.get(fl);
      if (!arr) { arr = []; firstLines.set(fl, arr); }
      if (arr.length < FL_CAP) arr.push({ p: id, i: poemIdx, t: title || "", f });
    }
  }
  console.log(`  ${file}: poems=${total} poets=${poets.size}`);
}

// charset ordered by desc frequency (ties by codepoint)
const chars = [...freq.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0))
  .map(([c]) => c);
const N = chars.length;

mkdirSync(join(OUT, "poems"), { recursive: true });

// charset.json
const charsStr = chars.join("");
let hh = 0x811c9dc5;
for (let i = 0; i < charsStr.length; i++) { hh ^= charsStr.charCodeAt(i); hh = Math.imul(hh, 0x01000193); }
writeFileSync(join(OUT, "charset.json"), JSON.stringify({ version: 1, n: N, hash: (hh >>> 0).toString(16), chars: charsStr }));

// poets.index.json (sorted by poemCount desc)
const clusterSize = (n) => Math.min(60, Math.max(2, +(2 + 1.4 * Math.sqrt(n)).toFixed(2)));
const index = [...poets.values()]
  .sort((a, b) => b.count - a.count)
  .map((p) => ({ id: p.id, name: p.name, dynasty: p.dynasty, poemCount: p.count, clusterSize: clusterSize(p.count) }));
writeFileSync(join(OUT, "poets.index.json"), JSON.stringify(index));

// poems bucketed by id[0:2] (256 buckets) -> {id: [{t,f,p}]}
const buckets = new Map();
for (const p of poets.values()) {
  const b = p.id.slice(0, 2);
  let obj = buckets.get(b);
  if (!obj) { obj = {}; buckets.set(b, obj); }
  obj[p.id] = p.poems;
}
// SKIP_HEAVY=1 reuses already-generated poems/+firstline/ (231+75 MB) to iterate fast on
// the lightweight gifts.json / manifest only.
const SKIP_HEAVY = !!process.env.SKIP_HEAVY;
if (!SKIP_HEAVY)
  for (const [b, obj] of buckets) writeFileSync(join(OUT, "poems", `${b}.json`), JSON.stringify(obj));

// ── first-line search index: firstline/{2-hex content bucket}.json -> {firstLine: [refs]} ──
mkdirSync(join(OUT, "firstline"), { recursive: true });
const flBuckets = new Map();
for (const [fl, refs] of firstLines) {
  const b = lineBucket(fl);
  let obj = flBuckets.get(b);
  if (!obj) { obj = {}; flBuckets.set(b, obj); }
  obj[fl] = refs;
}
if (!SKIP_HEAVY)
  for (const [b, obj] of flBuckets) writeFileSync(join(OUT, "firstline", `${b}.json`), JSON.stringify(obj));

// ── 赠诗 network: parse titles for 寄/赠/和/次韵… + a known poet NAME → poet→poet edges ──
// name -> poets with that name (each {id, dynId, count}); pick target by dynasty proximity.
const DYN_ORDER = ["xianqin","qinhan","weijin","nanbeichao","sui","tang","wudai","song","liao","jin","yuan","ming","qing","jinxiandai","dangdai"];
const dynId = (k) => { const i = DYN_ORDER.indexOf(k); return i < 0 ? 99 : i; };
const byName = new Map();
for (const p of poets.values()) {
  let a = byName.get(p.name);
  if (!a) { a = []; byName.set(p.name, a); }
  a.push({ id: p.id, dynId: dynId(p.dynasty), count: p.count });
}
// resolve a candidate name to one poet in the SAME dynasty as the author (social networks
// are overwhelmingly between contemporaries; cross-dynasty matches on a bare 2–3-char string
// are nearly always a place / 字号 collision, and would draw lines across the whole galaxy).
// Among same-dynasty namesakes pick the most prolific. Returns null if none qualify.
function resolveTarget(name, authorDynId, fromId) {
  const cands = byName.get(name);
  if (!cands) return null;
  let best = null, bestCount = -1;
  for (const c of cands) {
    if (c.id === fromId || c.dynId !== authorDynId) continue;
    if (c.count > bestCount) { bestCount = c.count; best = c; }
  }
  return best ? best.id : null;
}
// scan a title right after a marker for a known poet name. Prefer a 3-char full name (very
// low collision) anchored at the marker; fall back to a 2-char name immediately after it.
// `len2ok` gates the noisier 2-char fallback (only when no 3-char name is present).
function findName(after) {
  const win = [...after].slice(0, 6).join("");
  const stripped = win.replace(HONORIFIC, "");
  for (const probe of [stripped, win]) {
    const cs = [...probe];
    for (let s = 0; s <= 1 && s + 3 <= cs.length; s++) {
      const cand = cs.slice(s, s + 3).join("");
      if (!GIFT_STOP.has(cand) && byName.has(cand)) return cand;
    }
  }
  for (const probe of [stripped, win]) {
    const cs = [...probe];
    const cand = cs.slice(0, 2).join(""); // 2-char only immediately after the marker
    if (cand.length === 2 && !GIFT_STOP.has(cand) && byName.has(cand)) return cand;
  }
  return null;
}
const edgeW = new Map(); // "from|to" -> weight
for (const p of poets.values()) {
  const aDyn = dynId(p.dynasty);
  for (const poem of p.poems) {
    const title = poem.t;
    if (!title) continue;
    for (const mk of GIFT_MARKERS) {
      const at = title.indexOf(mk);
      if (at < 0) continue;
      const name = findName(title.slice(at + mk.length));
      if (!name) continue;
      const to = resolveTarget(name, aDyn, p.id);
      if (!to) continue;
      const key = p.id + "|" + to;
      edgeW.set(key, (edgeW.get(key) || 0) + 1);
      break; // one edge per poem (first matching marker wins)
    }
  }
}
const edges = [...edgeW.entries()]
  .map(([k, w]) => { const [from, to] = k.split("|"); return [from, to, w]; })
  .sort((a, b) => b[2] - a[2]);
writeFileSync(join(OUT, "gifts.json"), JSON.stringify({ version: 1, edgeCount: edges.length, edges }));

// dynasty poet counts
const dynCounts = {};
for (const p of poets.values()) dynCounts[p.dynasty] = (dynCounts[p.dynasty] || 0) + 1;

writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
  version: 2, n: N, poetCount: poets.size, poemCount: total,
  buckets: [...buckets.keys()].sort(),
  firstlineBuckets: [...flBuckets.keys()].sort(),
  giftEdges: edges.length,
  dynCounts,
}));
console.log(`\n首句索引 buckets=${flBuckets.size}  赠诗 edges=${edges.length}`);

console.log(`\nDONE  poets=${poets.size}  poems=${total}  字库 N=${N}  buckets=${buckets.size}`);
console.log("dynasty poet counts:", dynCounts);
