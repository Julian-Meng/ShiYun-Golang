import { useRef, useState } from "react";
import { searchPoets, searchByLine, loadPoetPoems, type PoetRow, type LineHit } from "../data/load";
import { DYNASTY_BY_KEY } from "../data/dynasties";
import { halfIndexAuto, type HalfIndex } from "../engine/engineApi";
import { useStore } from "../state/store";
import { poetPosition } from "../three/PoetStars";

const FORM_LABEL: Record<string, string> = {
  wujue: "五绝",
  qijue: "七绝",
  wulu: "五律",
  qilu: "七律",
};

export function SearchPanel() {
  const [tab, setTab] = useState<"poet" | "line">("poet");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PoetRow[]>([]);
  const [hits, setHits] = useState<LineHit[]>([]);
  const [half, setHalf] = useState<HalfIndex | null>(null);
  const selectPoet = useStore((s) => s.selectPoet);
  const setFlyTarget = useStore((s) => s.setFlyTarget);
  const reqRef = useRef(0);

  function onChangePoet(v: string) {
    setQ(v);
    setResults(searchPoets(v, 24));
  }

  function onChangeLine(v: string) {
    setQ(v);
    setHalf(halfIndexAuto(v)); // instant, no fetch — the 半编号 of this opening
    const token = ++reqRef.current;
    searchByLine(v).then((h) => {
      if (reqRef.current === token) setHits(h);
    });
  }

  function goPoet(p: PoetRow, focus?: { poemIdx: number; title: string; firstLine: string }) {
    selectPoet(p, focus ?? null);
    setFlyTarget(poetPosition(p));
    loadPoetPoems(p.id).then((poems) => useStore.getState().setPoetPoems(p.id, poems));
    setResults([]);
  }
  function goHit(h: LineHit) {
    if (!h.poet) return;
    goPoet(h.poet, { poemIdx: h.poemIdx, title: h.title, firstLine: h.firstLine });
  }

  function switchTab(t: "poet" | "line") {
    setTab(t);
    setQ("");
    setResults([]);
    setHits([]);
    setHalf(null);
  }

  return (
    <div className="search">
      <div className="search-tabs">
        <button className={tab === "poet" ? "stab on" : "stab"} onClick={() => switchTab("poet")}>
          诗人
        </button>
        <button className={tab === "line" ? "stab on" : "stab"} onClick={() => switchTab("line")}>
          诗句
        </button>
      </div>

      <input
        value={q}
        placeholder={tab === "poet" ? "搜索诗人…" : "输入一句诗,如 床前明月光"}
        onChange={(e) => (tab === "poet" ? onChangePoet(e.target.value) : onChangeLine(e.target.value))}
        spellCheck={false}
      />

      {tab === "poet" && results.length > 0 && (
        <div className="search-results">
          {results.map((p) => {
            const dyn = DYNASTY_BY_KEY[p.dynasty];
            return (
              <button key={p.id} className="search-row" onClick={() => goPoet(p)}>
                <span className="sr-name">{p.name}</span>
                <span className="sr-meta">
                  {dyn?.label ?? p.dynasty} · {p.poemCount}首
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "line" && half && (
        <div className="line-results">
          {hits.length > 0 && (
            <div className="lr-section">
              <div className="lr-head">真实诗人 · 这是谁的诗</div>
              {hits.map((h, i) => {
                const dyn = h.poet ? DYNASTY_BY_KEY[h.poet.dynasty] : undefined;
                return (
                  <button key={i} className="search-row" onClick={() => goHit(h)} disabled={!h.poet}>
                    <span className="sr-name">
                      {h.poet?.name ?? "佚名"}
                      <span className="sr-title">《{h.title || "无题"}》</span>
                    </span>
                    <span className="sr-meta">
                      {dyn?.label ?? ""} · {FORM_LABEL[h.form] ?? "古体"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="lr-section">
            <div className="lr-head">纯随机 · 半编号</div>
            <div className="half-note">
              若作为《{FORM_LABEL[half.form]}》开头,前 {half.locked} 字锁定了高位编号:
            </div>
            <div className="half-idx" title={`${half.digits} 位十进制`}>
              {half.index.length > 44 ? half.index.slice(0, 44) + "…" : half.index}
            </div>
            <div className="half-note dim">
              余 {half.freeChars} 字自由 → 这个开头下共有 字库<sup>{half.freeChars}</sup> 首诗,
              全在诗云的同一条高位街区里。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
