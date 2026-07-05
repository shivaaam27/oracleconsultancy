import { describe, it, expect } from "vitest";
import { computeInverseHomography, type Point } from "@/lib/perspective-warp";

// The scanner's auto-crop maps a photographed document's 4 corners onto a
// flat rectangle. `computeInverseHomography` is the pure math core — no
// DOM/canvas needed — so it's tested directly here rather than through the
// (untestable-without-a-browser) `warpToRectangle`.

function approxEqual(a: Point, b: Point, tol = 0.01) {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol);
}

describe("computeInverseHomography", () => {
  it("is the identity when src and dst are the same rectangle", () => {
    const rect: [Point, Point, Point, Point] = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 },
    ];
    const mapToSrc = computeInverseHomography(rect, rect);
    approxEqual(mapToSrc(50, 75), { x: 50, y: 75 });
    approxEqual(mapToSrc(0, 0), { x: 0, y: 0 });
    approxEqual(mapToSrc(200, 300), { x: 200, y: 300 });
  });

  it("handles a pure scale (axis-aligned rectangles of different sizes)", () => {
    // src is a 200x300 rect; dst is a 100x150 rect (half scale, no perspective).
    const src: [Point, Point, Point, Point] = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 },
    ];
    const dst: [Point, Point, Point, Point] = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 150 }, { x: 0, y: 150 },
    ];
    const mapToSrc = computeInverseHomography(src, dst);
    // A point at the centre of dst should map to the centre of src.
    approxEqual(mapToSrc(50, 75), { x: 100, y: 150 });
    approxEqual(mapToSrc(0, 0), { x: 0, y: 0 });
    approxEqual(mapToSrc(100, 150), { x: 200, y: 300 });
  });

  it("straightens a genuinely skewed (trapezoid) quadrilateral", () => {
    // src is a document photographed at an angle — narrower at the top than
    // the bottom (classic "tilted away from camera" trapezoid).
    const src: [Point, Point, Point, Point] = [
      { x: 50, y: 0 }, { x: 150, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 },
    ];
    const dst: [Point, Point, Point, Point] = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 },
    ];
    const mapToSrc = computeInverseHomography(src, dst);
    // The 4 corners must map back to the 4 src corners (within tolerance).
    approxEqual(mapToSrc(0, 0), src[0]);
    approxEqual(mapToSrc(200, 0), src[1]);
    approxEqual(mapToSrc(200, 100), src[2]);
    approxEqual(mapToSrc(0, 100), src[3]);
  });
});
