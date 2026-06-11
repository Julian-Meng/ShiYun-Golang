// Pure path math for the 平面坐标式 (plane-coordinate) poem guides — NO THREE / GPU / React, just typed
// arrays — so it unit-tests headless. Given a poem's REST offset O=(ox,oy,oz) from the poet centre (the
// LOCAL cluster frame, BEFORE self-rotation), each guide is a TWO-SEGMENT polyline:
//   • 平面段 (plane segment): origin (poet) → H = (ox, 0, oz)   — the poem's projection on the poet's
//     horizontal reference plane (the cluster equator). Reads bearing + radial distance.
//   • 垂直段 (vertical segment): H → P = (ox, oy, oz)            — straight up/down to the planet. Reads
//     height above/below the plane. oy≈0 → a degenerate (zero-length) vertical segment (fine).
//
// Rotation-safety: BOTH segment endpoints rotate with the SAME poet centre + omega in the shader. H has
// y=0 and sits at the SAME horizontal radius/phase as P, so a rotation about the poet's local Y axis maps
// the plane onto itself → the L-shape never shears as the cloud spins. The geometry stores LOCAL offsets
// (relative to the poet); the caller adds the poet centre into aCenter and the shader does centre+rotate.
//
// Staged grow (散射→直射): the shader grows each vertex from its segment's ANCHOR toward its TIP. The plane
// segment animates over the FIRST part of the grow window, the vertical segment over the LAST part:
//   stage 0 → plane segment   (window [0, SPLIT])
//   stage 1 → vertical segment (window [SPLIT, 1])
// We hand the shader, per vertex: aTip (final LOCAL offset = the vertex's resting position), aAnchor (the
// LOCAL offset it grows OUT FROM), and aStage (0/1). The shader lerps aAnchor→aTip by the per-stage
// progress, then adds the poet centre and rotates. (Both segments of one poem share aCenter/aOmega.)

/** Fraction of the grow window after which the vertical segments start rising (plane radiates first). */
export const PLANE_VERTICAL_SPLIT = 0.6;

// Interleaved per-poem layout for LineSegments (each segment = 2 vertices → 4 vertices/poem):
//   v0 = plane start   (origin)  anchor=origin  tip=origin   stage=0
//   v1 = plane end     (H)       anchor=origin  tip=H        stage=0
//   v2 = vertical start(H)       anchor=H       tip=H        stage=1
//   v3 = vertical end  (P)       anchor=H       tip=P        stage=1
export const VERTS_PER_POEM = 4;

export interface PlaneGuideArrays {
  tip: Float32Array; // [n*3] resting LOCAL offset of each vertex (== shader `position`)
  anchor: Float32Array; // [n*3] LOCAL offset each vertex grows OUT FROM
  stage: Float32Array; // [n]   0 = plane segment, 1 = vertical segment
  count: number; // vertex count (= poemCount * VERTS_PER_POEM)
}

/** A source of poem offsets — `offsetOf(localIdx)` returns the REST offset (ox,oy,oz) of the local-th
 *  guide. `count` is how many guides to build. Keeps this module independent of positions.ts. */
export interface OffsetSource {
  count: number;
  offsetOf(localIdx: number): [number, number, number];
}

/** Build the interleaved plane-guide vertex arrays in ONE allocation-lean pass (preallocated typed
 *  arrays, no per-vertex object churn) — mirrors the existing builders' style. */
export function buildPlaneGuidePaths(src: OffsetSource): PlaneGuideArrays {
  const P = Math.max(0, src.count);
  const count = P * VERTS_PER_POEM;
  const tip = new Float32Array(count * 3);
  const anchor = new Float32Array(count * 3);
  const stage = new Float32Array(count);
  for (let j = 0; j < P; j++) {
    const [ox, oy, oz] = src.offsetOf(j);
    const base = j * VERTS_PER_POEM; // first vertex of this poem
    // v0 plane start = origin: tip & anchor both (0,0,0) — already zero-filled; stage 0 (plane)
    stage[base + 0] = 0;
    // v1 plane end = H=(ox,0,oz); grows from origin
    const v1 = (base + 1) * 3;
    tip[v1] = ox; tip[v1 + 1] = 0; tip[v1 + 2] = oz;
    // anchor[v1] = origin — already zero
    stage[base + 1] = 0;
    // v2 vertical start = H; anchor = H (so the vertical segment sits at H once the plane is grown)
    const v2 = (base + 2) * 3;
    tip[v2] = ox; tip[v2 + 1] = 0; tip[v2 + 2] = oz;
    anchor[v2] = ox; anchor[v2 + 1] = 0; anchor[v2 + 2] = oz;
    stage[base + 2] = 1;
    // v3 vertical end = P=(ox,oy,oz); grows from H up/down to the planet
    const v3 = (base + 3) * 3;
    tip[v3] = ox; tip[v3 + 1] = oy; tip[v3 + 2] = oz;
    anchor[v3] = ox; anchor[v3 + 1] = 0; anchor[v3 + 2] = oz;
    stage[base + 3] = 1;
  }
  return { tip, anchor, stage, count };
}

/** Per-stage grow progress at overall grow t∈[0,1]: the plane segment fills over [0,SPLIT], the vertical
 *  over [SPLIT,1]. Returned as [planeProgress, verticalProgress], each clamped to [0,1]. Mirrors the
 *  shader so it can be unit-tested without a GPU. */
export function stageProgress(t: number, split = PLANE_VERTICAL_SPLIT): [number, number] {
  const plane = split <= 0 ? 1 : clamp01(t / split);
  const vert = split >= 1 ? 0 : clamp01((t - split) / (1 - split));
  return [plane, vert];
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ── Equator reference ring ────────────────────────────────────────────────────────────────────────
// A faint circle outline at the poet's horizontal plane (y=0 in the LOCAL frame), radius = the cluster's
// horizontal extent. Built as a LineLoop-style polyline of `segments` points (returned as LOCAL offsets,
// y=0). It shares the guides' aCenter/aOmega so it rotates with the cloud — and since it lies in the
// plane, the rotation just spins the circle in place (visually static), exactly like the L-shapes.
export function buildEquatorRing(radius: number, segments = 96): Float32Array {
  const n = Math.max(3, segments | 0);
  const out = new Float32Array(n * 3); // n points; caller draws as a closed LineLoop
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out[i * 3] = Math.cos(a) * radius;
    out[i * 3 + 1] = 0;
    out[i * 3 + 2] = Math.sin(a) * radius;
  }
  return out;
}
