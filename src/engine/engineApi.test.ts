import { describe, it, expect, beforeAll } from "vitest";
import { setDataset } from "../data/provider";
import { makeFixtureLexicon } from "./lexicon.fixture";
import { textBabelIndex, anyTextIndex, pullByIndex, inCharset } from "./engineApi";

// The 造诗 (compose) UI calls these app-facing engineApi functions: fill a grid → textBabelIndex,
// write 自由 lines → anyTextIndex, paste a number → pullByIndex. Verify the compose ⇄ reverse
// round-trips against a fixture dataset (120-char 字库 matching makeFixtureLexicon N=120).
const lex = makeFixtureLexicon(60, 60, 6); // N = 120
const charset = Array.from({ length: lex.N }, (_, i) => String.fromCodePoint(0x4e00 + i)); // 一, 丁, 丂 …

beforeAll(() => setDataset({ lexicon: lex, charset }));

describe("engineApi 造诗 ⇄ 反查 round-trips", () => {
  it("fixed form: textBabelIndex(form, text) → pullByIndex(form, idx) reproduces the exact poem", () => {
    const text = charset.slice(0, 20).join(""); // a filled 五绝 grid (L = 20)
    const r = textBabelIndex("wujue", text);
    expect(r).not.toBeNull();
    const back = pullByIndex("wujue", r!.index);
    expect(back?.inRange).toBe(true);
    expect(back!.lines.join("")).toBe(text);
    expect(back!.lines.map((l) => [...l].length)).toEqual([5, 5, 5, 5]); // 4 lines × 5 chars
  });

  it("自由: anyTextIndex(lines) → pullByIndex('ziyou', idx) reproduces the exact lines + line breaks", () => {
    const lines = [charset.slice(0, 3).join(""), charset.slice(3, 5).join(""), charset.slice(5, 10).join("")];
    const r = anyTextIndex(lines);
    expect(r).not.toBeNull();
    expect(r!.chars).toBe(10);
    expect(r!.lines).toBe(3);
    const back = pullByIndex("ziyou", r!.index);
    expect(back!.lines).toEqual(lines);
  });

  it("textBabelIndex rejects wrong-length or out-of-字库 input (so the grid only ranks valid poems)", () => {
    expect(textBabelIndex("wujue", charset.slice(0, 19).join(""))).toBeNull(); // 19 ≠ 20
    expect(textBabelIndex("wujue", charset.slice(0, 19).join("") + "Z")).toBeNull(); // Z dropped → 19
  });

  it("inCharset reflects the active 字库 (drives per-cell compose feedback)", () => {
    expect(inCharset(charset[0])).toBe(true);
    expect(inCharset(charset[lex.N - 1])).toBe(true);
    expect(inCharset("Z")).toBe(false);
    expect(inCharset("")).toBe(false);
  });
});
