import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

// 诗云设置 menu — collects the 指引 / 行星 / 赠诗 / 引力 controls (moved out of the HUD top bar). Opened by
// the HUD ⚙设置 button. 赠诗漫游 stays a separate panel (it only shows when 赠诗 is on). 恢复默认 = the
// app defaults (指引 一次性·优化·10s; 行星 关; 赠诗 关; 引力 开).
const GUIDE_MODES = [
  ["off", "不显示"],
  ["flash", "一次性"],
  ["hold", "常驻"],
] as const;

export function SettingsMenu() {
  const open = useStore((s) => s.settingsOpen);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const guideMode = useStore((s) => s.guideMode);
  const setGuideMode = useStore((s) => s.setGuideMode);
  const guideCoverage = useStore((s) => s.guideCoverage);
  const setGuideCoverage = useStore((s) => s.setGuideCoverage);
  const guideSeconds = useStore((s) => s.guideSeconds);
  const setGuideSeconds = useStore((s) => s.setGuideSeconds);
  const guideBrightness = useStore((s) => s.guideBrightness);
  const setGuideBrightness = useStore((s) => s.setGuideBrightness);
  const resetGuide = useStore((s) => s.resetGuide);
  const showAllPoems = useStore((s) => s.showAllPoems);
  const toggleAllPoems = useStore((s) => s.toggleAllPoems);
  const showGifts = useStore((s) => s.showGifts);
  const toggleGifts = useStore((s) => s.toggleGifts);
  const gravity = useStore((s) => s.gravity);
  const toggleGravity = useStore((s) => s.toggleGravity);

  // DRAGGABLE (item 2): default below the top bar + left of the right-side panels (诗人/诗 panels), so it
  // never traps behind them — drag the header to move it anywhere and watch the effect live.
  const [pos, setPos] = useState({ x: 360, y: 56 });
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setPos({ x: Math.max(4, e.clientX - dragRef.current.ox), y: Math.max(4, e.clientY - dragRef.current.oy) });
    };
    const onUp = () => (dragRef.current = null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!open) return null;

  const guideDefault = guideMode === "flash" && guideCoverage === "optimized" && guideSeconds === 10 && guideBrightness === 0.7;
  const allDefault = guideDefault && !showAllPoems && !showGifts && gravity;
  const resetAll = () => {
    resetGuide();
    if (showAllPoems) toggleAllPoems();
    if (showGifts) toggleGifts();
    if (!gravity) toggleGravity();
  };

  return (
    <div className="settings" style={{ left: pos.x, top: pos.y, right: "auto" }}>
      <div
        className="set-head drag"
        onPointerDown={(e) => (dragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y })}
      >
        <span>诗云设置 ⠿</span>
        <button className="set-close" onClick={toggleSettings} title="关闭">×</button>
      </div>

      <div className="set-group">
        <div className="set-label">行星指引线</div>
        <div className="set-row">
          <span className="set-sub">显示</span>
          <div className="seg">
            {GUIDE_MODES.map(([m, l]) => (
              <button key={m} className={guideMode === m ? "seg-btn on" : "seg-btn"} onClick={() => setGuideMode(m)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="set-row">
          <span className="set-sub">覆盖</span>
          <div className="seg">
            <button className={guideCoverage === "all" ? "seg-btn on" : "seg-btn"} onClick={() => setGuideCoverage("all")} title="每首诗都连线,一首不漏">全部</button>
            <button className={guideCoverage === "optimized" ? "seg-btn on" : "seg-btn"} onClick={() => setGuideCoverage("optimized")} title="数量很大时跨全段采样,更流畅">优化</button>
          </div>
        </div>
        <div className="set-row">
          <span className="set-sub">时长</span>
          <input
            type="range"
            min={2}
            max={60}
            step={1}
            value={guideSeconds}
            disabled={guideMode !== "flash"}
            onChange={(e) => setGuideSeconds(Number(e.target.value))}
            className="set-slider"
          />
          <span className="set-val">{guideMode === "flash" ? `${guideSeconds}s` : guideMode === "hold" ? "常驻" : "—"}</span>
        </div>
        <div className="set-row">
          <span className="set-sub">亮度</span>
          <input
            type="range"
            min={0.2}
            max={2}
            step={0.05}
            value={guideBrightness}
            disabled={guideMode === "off"}
            onChange={(e) => setGuideBrightness(Number(e.target.value))}
            className="set-slider"
          />
          <span className="set-val">{guideBrightness.toFixed(2)}×</span>
        </div>
        <button className="set-reset" onClick={resetGuide} disabled={guideDefault}>指引恢复默认</button>
      </div>

      <div className="set-group">
        <div className="set-label">显示层</div>
        <label className="set-toggle">
          <input type="checkbox" checked={showAllPoems} onChange={toggleAllPoems} />
          行星 · 全部诗人的作品环绕（建议高性能）
        </label>
        <label className="set-toggle">
          <input type="checkbox" checked={showGifts} onChange={toggleGifts} />
          赠诗网络 · 开启后左下出现「赠诗漫游」
        </label>
        <label className="set-toggle">
          <input type="checkbox" checked={gravity} onChange={toggleGravity} />
          引力 · 摄像机随星系自转,恒星好点选
        </label>
      </div>

      <button className="set-reset wide" onClick={resetAll} disabled={allDefault}>全部恢复默认</button>
    </div>
  );
}
