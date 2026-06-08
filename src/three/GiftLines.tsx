import * as THREE from "three";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { getPoet, loadGifts } from "../data/load";
import { DYNASTY_BY_KEY, DYNASTIES, DYNASTY_COUNT } from "../data/dynasties";
import { poetPosition } from "./PoetStars";
import type { GiftEdge } from "../data/contract";

// 赠诗 network: faint lines between poets one dedicated a poem to (寄/赠/和/次韵…). Both
// endpoints are same-dynasty corpus poets, so a line stays within a dynasty shell (visually
// coherent). Selecting a poet lights up their dedications; the rest dim back.
interface Edge {
  a: [number, number, number];
  b: [number, number, number];
  ca: THREE.Color;
  cb: THREE.Color;
  fromDyn: string;
  toDyn: string;
  from: string;
  to: string;
}

export function GiftLines() {
  const showGifts = useStore((s) => s.showGifts);
  const hidden = useStore((s) => s.hidden);
  const selId = useStore((s) => s.selectedPoet?.id ?? null);
  const [raw, setRaw] = useState<GiftEdge[] | null>(null);

  // lazy-load the edge list the first time the layer is switched on
  useEffect(() => {
    if (showGifts && !raw) loadGifts().then(setRaw);
  }, [showGifts, raw]);

  // resolve each edge's endpoints to galaxy positions + dynasty colours (once, per dataset)
  const edges = useMemo<Edge[]>(() => {
    if (!raw) return [];
    const out: Edge[] = [];
    const fallback = DYNASTIES[DYNASTY_COUNT - 1];
    for (const [from, to] of raw) {
      const pf = getPoet(from);
      const pt = getPoet(to);
      if (!pf || !pt) continue;
      out.push({
        a: poetPosition(pf),
        b: poetPosition(pt),
        ca: new THREE.Color((DYNASTY_BY_KEY[pf.dynasty] ?? fallback).color),
        cb: new THREE.Color((DYNASTY_BY_KEY[pt.dynasty] ?? fallback).color),
        fromDyn: pf.dynasty,
        toDyn: pt.dynasty,
        from,
        to,
      });
    }
    return out;
  }, [raw]);

  // (re)build the line geometry whenever the visible set or selection changes (cheap: ≤ a few k)
  const object = useMemo(() => {
    if (!edges.length) return null;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const e of edges) {
      if (hidden.has(e.fromDyn) || hidden.has(e.toDyn)) continue;
      const hot = selId !== null && (e.from === selId || e.to === selId);
      const factor = hot ? 1.7 : selId !== null ? 0.1 : 0.42;
      pos.push(e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]);
      c.copy(e.ca).multiplyScalar(factor);
      col.push(c.r, c.g, c.b);
      c.copy(e.cb).multiplyScalar(factor);
      col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ls = new THREE.LineSegments(g, m);
    ls.frustumCulled = false;
    return ls;
  }, [edges, hidden, selId]);

  // dispose the previous geometry/material when it is replaced or unmounted
  useEffect(() => {
    return () => {
      if (object) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    };
  }, [object]);

  if (!showGifts || !object) return null;
  return <primitive object={object} />;
}
