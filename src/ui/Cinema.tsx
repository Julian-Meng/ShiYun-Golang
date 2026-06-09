import { useStore } from "../state/store";
import { anyTextIndex } from "../engine/engineApi";

// 奇迹时刻 — a framed "share card" over the FROZEN scene (the store.cinema flag pauses spin + the
// void-pull / highlight lifecycles in the r3f layers), to guide a screenshot. The overlay itself is
// pointer-events:none EXCEPT its controls, so you can still drag the camera through it to compose the
// shot, then screenshot. Copy emphasises the 诗云 / 巴别图书馆 concept; the user cycles taglines with ‹ ›.
const TAGLINES = [
  "一切可能的诗都已写就,藏在这片噪声的星海里。你刚刚,捞起了其中一首。",
  "在诗云里,杰作不被创作,只被找到——它本就在那里,等你给它一个编号。",
  "一个文明算尽了所有的字,写下了每一首可能的诗,却再也认不出哪首最美。而你,遇见了这一首。",
  "这首诗有一个住址,长达数十位——地址几乎和诗本身一样长。目录,即是图书馆。",
  "巴别图书馆收藏了一切可能的诗。这,是它的一件藏品。",
];

export function Cinema() {
  const cinema = useStore((s) => s.cinema);
  const close = useStore((s) => s.toggleCinema);
  const selected = useStore((s) => s.selected);
  const poet = useStore((s) => s.selectedPoet);
  const poems = useStore((s) => s.poetPoems);
  const focus = useStore((s) => s.poetFocus);
  const copyIdx = useStore((s) => s.cinemaCopy);
  const setCopy = useStore((s) => s.setCinemaCopy);
  if (!cinema) return null;

  // resolve the framed poem: a void pull (the purest 奇迹), else the selected poet's focused real poem.
  let lines: string[] | null = null;
  let index: string | null = null;
  let digits = 0;
  let attribution = "";
  if (selected) {
    lines = selected.lines;
    index = selected.babelIndex;
    digits = selected.babelDigits;
    attribution = "诗云 · 从虚空里捞起";
  } else if (poet && poems && focus && focus.poemIdx >= 0 && poems[focus.poemIdx]) {
    const pm = poems[focus.poemIdx];
    const a = anyTextIndex(pm.p);
    lines = pm.p;
    index = a?.index ?? null;
    digits = a?.digits ?? 0;
    attribution = `${poet.name}《${pm.t || "无题"}》`;
  }
  const n = TAGLINES.length;
  const tag = TAGLINES[((copyIdx % n) + n) % n];

  return (
    <div className="cinema">
      <div className="cinema-frame" />

      <div className="cinema-tag">
        <button className="cinema-arrow" onClick={() => setCopy(copyIdx - 1)} aria-label="上一句">‹</button>
        <span className="cinema-tag-text">{tag}</span>
        <button className="cinema-arrow" onClick={() => setCopy(copyIdx + 1)} aria-label="下一句">›</button>
      </div>

      {lines && (
        <div className="cinema-card">
          {/* classical 竖排: each line is a column, columns flow RIGHT→LEFT (writing-mode in CSS) so a
              long poem spreads sideways instead of getting clipped at the bottom. */}
          <div className="cinema-poem" lang="zh">
            {lines.map((l, i) => (
              <div key={i} className="cinema-line">{l}</div>
            ))}
          </div>
          <div className="cinema-attr">{attribution}</div>
          {index && (
            <div className="cinema-idx">
              <div className="cinema-idx-k">全集编号 · {digits} 位 · 它在诗云里的唯一住址</div>
              <div className="cinema-idx-num">{index}</div>
            </div>
          )}
        </div>
      )}

      <div className="cinema-brand">诗云 · Poetry Cloud</div>
      <button className="cinema-exit" onClick={close} title="退出奇迹时刻">截好图 · 退出 ✕</button>
    </div>
  );
}
