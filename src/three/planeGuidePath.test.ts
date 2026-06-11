import { describe, it, expect } from "vitest";
import {
  buildPlaneGuidePaths,
  buildEquatorRing,
  stageProgress,
  PLANE_VERTICAL_SPLIT,
  VERTS_PER_POEM,
  type OffsetSource,
} from "./planeGuidePath";

// A tiny offset source from a fixed list of offsets — keeps the test independent of positions.ts.
function src(offsets: [number, number, number][]): OffsetSource {
  return { count: offsets.length, offsetOf: (i) => offsets[i] };
}
const v = (a: Float32Array, vert: number) => [a[vert * 3], a[vert * 3 + 1], a[vert * 3 + 2]];

describe("buildPlaneGuidePaths — geometry", () => {
  it("emits 4 vertices per poem (two LineSegments segments)", () => {
    const a = buildPlaneGuidePaths(src([[1, 2, 3], [4, 5, 6], [7, 8, 9]]));
    expect(VERTS_PER_POEM).toBe(4);
    expect(a.count).toBe(3 * 4);
    expect(a.tip.length).toBe(3 * 4 * 3);
    expect(a.anchor.length).toBe(3 * 4 * 3);
    expect(a.stage.length).toBe(3 * 4);
  });

  it("zero poems → empty arrays", () => {
    const a = buildPlaneGuidePaths(src([]));
    expect(a.count).toBe(0);
    expect(a.tip.length).toBe(0);
    expect(a.anchor.length).toBe(0);
    expect(a.stage.length).toBe(0);
  });

  it("plane segment runs origin → H=(ox,0,oz); vertical segment runs H → P=(ox,oy,oz)", () => {
    const O: [number, number, number] = [12, -7, 5];
    const a = buildPlaneGuidePaths(src([O]));
    const [ox, oy, oz] = O;
    // v0 plane start = origin, v1 plane end = H (y zeroed)
    expect(v(a.tip, 0)).toEqual([0, 0, 0]);
    expect(v(a.tip, 1)).toEqual([ox, 0, oz]);
    // v2 vertical start = H, v3 vertical end = P (full offset incl. y)
    expect(v(a.tip, 2)).toEqual([ox, 0, oz]);
    expect(v(a.tip, 3)).toEqual([ox, oy, oz]);
  });

  it("anchors: plane grows from origin, vertical grows from H", () => {
    const O: [number, number, number] = [12, -7, 5];
    const a = buildPlaneGuidePaths(src([O]));
    const [ox, , oz] = O;
    expect(v(a.anchor, 0)).toEqual([0, 0, 0]); // plane start grows from origin
    expect(v(a.anchor, 1)).toEqual([0, 0, 0]); // plane end grows from origin
    expect(v(a.anchor, 2)).toEqual([ox, 0, oz]); // vertical start anchored at H
    expect(v(a.anchor, 3)).toEqual([ox, 0, oz]); // vertical end grows from H
  });

  it("stage attribute: first two vertices plane (0), last two vertical (1)", () => {
    const a = buildPlaneGuidePaths(src([[1, 2, 3], [4, 5, 6]]));
    expect(Array.from(a.stage)).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
  });

  it("oy < 0 (poem below the plane): vertical tip y is negative, H stays at y=0", () => {
    const a = buildPlaneGuidePaths(src([[3, -9, 4]]));
    expect(v(a.tip, 2)).toEqual([3, 0, 4]); // H on the plane
    expect(v(a.tip, 3)).toEqual([3, -9, 4]); // planet below
    expect(a.tip[3 * 3 + 1]).toBeLessThan(0);
  });

  it("oy ≈ 0 (poem on the plane): vertical segment is degenerate (H == P)", () => {
    const a = buildPlaneGuidePaths(src([[6, 0, 8]]));
    expect(v(a.tip, 2)).toEqual([6, 0, 8]);
    expect(v(a.tip, 3)).toEqual([6, 0, 8]); // identical → zero-length vertical segment
  });
});

describe("stageProgress — staged grow (散射 → 直射)", () => {
  it("at t=0 nothing has grown", () => {
    expect(stageProgress(0)).toEqual([0, 0]);
  });
  it("plane fills first; vertical still 0 until the split", () => {
    const [plane, vert] = stageProgress(PLANE_VERTICAL_SPLIT / 2);
    expect(plane).toBeGreaterThan(0);
    expect(plane).toBeLessThan(1);
    expect(vert).toBe(0); // vertical hasn't started before the split
  });
  it("plane is full exactly at the split, vertical just starting", () => {
    const [plane, vert] = stageProgress(PLANE_VERTICAL_SPLIT);
    expect(plane).toBe(1);
    expect(vert).toBe(0);
  });
  it("after the split the vertical rises while the plane stays full", () => {
    const [plane, vert] = stageProgress((PLANE_VERTICAL_SPLIT + 1) / 2);
    expect(plane).toBe(1);
    expect(vert).toBeGreaterThan(0);
    expect(vert).toBeLessThan(1);
  });
  it("at t=1 both segments are fully grown", () => {
    expect(stageProgress(1)).toEqual([1, 1]);
  });
  it("is monotonic non-decreasing across the grow window", () => {
    let lastPlane = -1, lastVert = -1;
    for (let i = 0; i <= 20; i++) {
      const [plane, vert] = stageProgress(i / 20);
      expect(plane).toBeGreaterThanOrEqual(lastPlane);
      expect(vert).toBeGreaterThanOrEqual(lastVert);
      lastPlane = plane; lastVert = vert;
    }
    expect(lastPlane).toBe(1);
    expect(lastVert).toBe(1);
  });
  it("clamps to [0,1] outside the window", () => {
    expect(stageProgress(-1)).toEqual([0, 0]);
    expect(stageProgress(2)).toEqual([1, 1]);
  });
});

describe("buildEquatorRing", () => {
  it("emits `segments` points, all on the plane (y=0), at the given radius", () => {
    const r = 250;
    const ring = buildEquatorRing(r, 32);
    expect(ring.length).toBe(32 * 3);
    for (let i = 0; i < 32; i++) {
      const x = ring[i * 3], y = ring[i * 3 + 1], z = ring[i * 3 + 2];
      expect(y).toBe(0); // strictly on the reference plane
      expect(Math.hypot(x, z)).toBeCloseTo(r, 3); // on the circle of radius r (Float32 storage)
    }
  });
  it("first point sits on +X (cos0,sin0)", () => {
    const ring = buildEquatorRing(100, 8);
    expect(ring[0]).toBeCloseTo(100, 3);
    expect(ring[2]).toBeCloseTo(0, 3);
  });
  it("clamps to a minimum of 3 segments", () => {
    expect(buildEquatorRing(10, 1).length).toBe(3 * 3);
    expect(buildEquatorRing(10, 0).length).toBe(3 * 3);
  });
});
