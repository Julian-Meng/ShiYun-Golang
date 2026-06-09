import { describe, it, expect } from "vitest";
import { encodePickColor, encodePoemPickColor, nearestPoetIndex, nearestPickId, POEM_PICK_BASE } from "./gpuPick";

// Decode the way the picker does on CPU after readback (id = r | g<<8 | b<<16; index = id-1).
const decode = (r: number, g: number, b: number) => (r | (g << 8) | (b << 16)) - 1;
// encodePickColor returns components in [0,1]; the GPU stores them as 8-bit, so *255 round-trips.
const toBytes = (i: number) => encodePickColor(i).map((c) => Math.round(c * 255)) as [number, number, number];
const rawId = (r: number, g: number, b: number) => r | (g << 8) | (b << 16);
const poemBytes = (i: number) => encodePoemPickColor(i).map((c) => Math.round(c * 255)) as [number, number, number];

describe("gpuPick colour-ID encode/decode", () => {
  it("round-trips poet indices across byte boundaries", () => {
    for (const i of [0, 1, 254, 255, 256, 257, 65535, 65536, 65537, 29807]) {
      const [r, g, b] = toBytes(i);
      expect(decode(r, g, b)).toBe(i);
    }
  });
  it("index 0 encodes to a NON-zero colour (so cleared background = miss)", () => {
    const [r, g, b] = toBytes(0);
    expect(r | g | b).not.toBe(0); // background (0,0,0) must never collide with a real poet
    expect(decode(0, 0, 0)).toBe(-1); // and the background decodes to a miss
  });
});

describe("poem-planet pick ids (poet vs poem disambiguation)", () => {
  it("poem ids round-trip and sit ABOVE POEM_PICK_BASE", () => {
    for (const local of [0, 1, 255, 256, 65535, 65536, 857876]) {
      const [r, g, b] = poemBytes(local);
      const id = rawId(r, g, b);
      expect(id).toBeGreaterThanOrEqual(POEM_PICK_BASE); // decoded as a POEM, never a poet/miss
      expect(id - POEM_PICK_BASE).toBe(local); // exact local-id recovery
      expect(id).toBeLessThan(0x1000000); // still inside the 24-bit colour-id space
    }
  });
  it("poet ids stay BELOW POEM_PICK_BASE (no namespace collision)", () => {
    for (const i of [0, 1, 29807]) {
      const [r, g, b] = toBytes(i);
      expect(rawId(r, g, b)).toBeLessThan(POEM_PICK_BASE); // a poet never decodes as a poem
    }
  });
});

describe("nearestPickId (raw id for poet/poem split)", () => {
  const n = 5, radius = 2;
  const put = (buf: Uint8Array, x: number, y: number, rgb: [number, number, number]) => {
    const o = (y * n + x) * 4;
    buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2]; buf[o + 3] = 255;
  };
  it("returns 0 (miss) for an empty window", () => {
    expect(nearestPickId(new Uint8Array(n * n * 4), n, radius)).toBe(0);
  });
  it("returns the raw poem id (decodable to its local index)", () => {
    const buf = new Uint8Array(n * n * 4);
    put(buf, 2, 2, poemBytes(4242));
    const id = nearestPickId(buf, n, radius);
    expect(id).toBeGreaterThanOrEqual(POEM_PICK_BASE);
    expect(id - POEM_PICK_BASE).toBe(4242);
  });
  it("prefers the hit closest to the centre when a poet and a poem overlap", () => {
    const buf = new Uint8Array(n * n * 4);
    put(buf, 0, 0, toBytes(11)); // poet, far corner
    put(buf, 2, 2, poemBytes(7)); // poem, dead centre → should win
    const id = nearestPickId(buf, n, radius);
    expect(id).toBe(POEM_PICK_BASE + 7);
  });
});

describe("nearestPoetIndex", () => {
  const n = 5;
  const radius = 2; // centre pixel = (2,2)
  function emptyBuf() {
    return new Uint8Array(n * n * 4);
  }
  function put(buf: Uint8Array, x: number, y: number, index: number) {
    const [r, g, b] = toBytes(index);
    const o = (y * n + x) * 4;
    buf[o] = r;
    buf[o + 1] = g;
    buf[o + 2] = b;
    buf[o + 3] = 255;
  }

  it("returns -1 for an all-background window", () => {
    expect(nearestPoetIndex(emptyBuf(), n, radius)).toBe(-1);
  });
  it("finds a single hit anywhere in the window", () => {
    const buf = emptyBuf();
    put(buf, 0, 4, 4242);
    expect(nearestPoetIndex(buf, n, radius)).toBe(4242);
  });
  it("picks the hit CLOSEST to the centre when several overlap", () => {
    const buf = emptyBuf();
    put(buf, 0, 0, 11); // far corner (dist² = 8)
    put(buf, 2, 3, 22); // one below centre (dist² = 1) → should win
    put(buf, 4, 4, 33); // far corner
    expect(nearestPoetIndex(buf, n, radius)).toBe(22);
  });
  it("returns the exact-centre hit", () => {
    const buf = emptyBuf();
    put(buf, 2, 2, 777);
    put(buf, 1, 2, 888);
    expect(nearestPoetIndex(buf, n, radius)).toBe(777);
  });
});
