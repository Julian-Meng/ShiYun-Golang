import { useStore } from "../state/store";

// 诗名指引 (item 7): while a poet is selected, hovering one of its planets shows that poem's title in a
// small tooltip near the cursor (set by FlyControls' hover poem-pick). Pure overlay, no pointer events.
export function PoemHoverLabel() {
  const hp = useStore((s) => s.hoverPoem);
  if (!hp) return null;
  return (
    <div className="poem-hover" style={{ left: hp.x + 14, top: hp.y + 16 }}>
      《{hp.title}》
    </div>
  );
}
