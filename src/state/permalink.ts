// Shareable URL-hash state. Two forms:
//   #a=<poetId>          → a poet (restored: select + fly + load poems)
//   #p=<form>.<index>    → a void-pulled poem (form ∈ wujue|qijue|wulu|qilu|ziyou)
// The hash is kept in sync with the current selection (App effect); panels copy location.href.
import { useStore } from "./store";
import { pulledFromIndex, type PullForm } from "../engine/engineApi";
import { getPoet, loadPoetPoems } from "../data/load";
import { poetPosition } from "../three/PoetStars";

const FORMS: PullForm[] = ["wujue", "qijue", "wulu", "qilu", "ziyou"];

/** The hash that represents the current selection (empty if nothing selected). */
export function currentHash(): string {
  const s = useStore.getState();
  if (s.selectedPoet) return `#a=${s.selectedPoet.id}`;
  if (s.selected) return `#p=${s.selected.form}.${s.selected.babelIndex}`;
  return "";
}

/** Keep the address bar in sync (no history spam). */
export function syncHash(): void {
  const h = currentHash();
  const url = h || location.pathname + location.search;
  if (location.hash !== h) history.replaceState(null, "", url);
}

/** Restore state from the URL hash at boot (after data is loaded). */
export function applyHash(): void {
  const h = location.hash.replace(/^#/, "");
  if (!h) return;
  const eq = h.indexOf("=");
  if (eq < 0) return;
  const k = h.slice(0, eq);
  const val = decodeURIComponent(h.slice(eq + 1));
  const st = useStore.getState();
  if (k === "a") {
    const poet = getPoet(val);
    if (poet) {
      st.selectPoet(poet);
      st.setFlyTarget(poetPosition(poet));
      loadPoetPoems(poet.id).then((poems) => useStore.getState().setPoetPoems(poet.id, poems));
    }
  } else if (k === "p") {
    const dot = val.indexOf(".");
    if (dot < 0) return;
    const form = val.slice(0, dot) as PullForm;
    if (!FORMS.includes(form)) return;
    const poem = pulledFromIndex(form, val.slice(dot + 1));
    if (poem) {
      st.selectPoem(poem);
      st.setFlyTarget(poem.pos);
    }
  }
}
