// Perspective ("keystone") correction for the scanner's auto-crop (Phase 2 of
// the phased plan — see memory/documents_redesign_plan_jul2026.md). Pure
// client-side canvas math, no dependencies: given a source image and the 4
// corners of a document within it (in clockwise order starting top-left),
// produces a new image where that quadrilateral has been mapped onto a flat
// rectangle — i.e. a photo taken at an angle comes out looking top-down, the
// way a real scanner (or iOS's Files scanner) would.
//
// Canvas 2D has no built-in arbitrary-quadrilateral draw, so this computes a
// projective (homography) transform from the 4 source corners to the 4
// corners of the output rectangle, then walks every output pixel and samples
// the corresponding source pixel (inverse mapping — the standard way to warp
// without leaving holes). Deliberately dependency-free rather than pulling in
// a CV library for one function.

export type Point = { x: number; y: number };

/** Solve the 8 coefficients of a projective transform mapping the 4 `src`
 *  points to the 4 `dst` points (both in pixel space). Returns a function
 *  dst->src (the INVERSE mapping, which is what pixel-sampling needs).
 *  Exported (unlike the rest of this module's internals) so the pure math can
 *  be unit-tested without a DOM/canvas — see perspective-warp.test.ts. */
export function computeInverseHomography(src: [Point, Point, Point, Point], dst: [Point, Point, Point, Point]) {
  // Standard DLT-style 8-point solve for a planar homography. We solve for
  // the FORWARD map (src -> dst) then invert the 3x3 matrix, since deriving
  // the inverse directly from swapped point order also works and is simpler.
  const h = solveHomography(dst, src); // dst -> src directly (what we need)
  return (x: number, y: number): Point => {
    const [a, b, c, d, e, f, g, i] = h;
    const denom = g * x + i * y + 1;
    return { x: (a * x + b * y + c) / denom, y: (d * x + e * y + f) / denom };
  };
}

/** Solve the 8 unknowns of a homography mapping `from`[k] -> `to`[k] for k=0..3,
 *  via straightforward Gaussian elimination on the 8x8 linear system. */
function solveHomography(from: [Point, Point, Point, Point], to: [Point, Point, Point, Point]): number[] {
  // Each point pair gives 2 equations; 4 pairs -> 8x8 system for
  // [a,b,c,d,e,f,g,i] where:
  //   to.x = (a*from.x + b*from.y + c) / (g*from.x + i*from.y + 1)
  //   to.y = (d*from.x + e*from.y + f) / (g*from.x + i*from.y + 1)
  const A: number[][] = [];
  const B: number[] = [];
  for (const [p, q] of from.map((p, k) => [p, to[k]] as const)) {
    A.push([p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x]);
    B.push(q.x);
    A.push([0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y]);
    B.push(q.y);
  }
  return gaussianSolve(A, B);
}

/** Solve Ax = B for an 8x8 system via Gaussian elimination with partial pivoting. */
function gaussianSolve(A: number[][], B: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-12) continue; // degenerate — leave as 0, caller treats a bad result as "skip warp"
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pv;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (Math.abs(row[i]) < 1e-12 ? 1 : row[i]));
}

/** Straight-line distance, used to size the output rectangle from the corners. */
function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Warp the quadrilateral `corners` (clockwise from top-left, in the SAME
 * pixel space as `img`) onto a flat rectangle, sized from the corners'
 * average width/height so the output keeps the document's real proportions.
 * Returns null if the math degenerates (near-collinear points etc.) — the
 * caller should fall back to the original, unwarped image in that case.
 */
export function warpToRectangle(img: ImageBitmap, corners: [Point, Point, Point, Point], maxDim = 2000): HTMLCanvasElement | null {
  const [tl, tr, br, bl] = corners;
  const outW = Math.round((dist(tl, tr) + dist(bl, br)) / 2);
  const outH = Math.round((dist(tl, bl) + dist(tr, br)) / 2);
  if (outW < 20 || outH < 20) return null; // degenerate quad — not worth warping

  const scale = Math.min(1, maxDim / Math.max(outW, outH));
  const w = Math.max(1, Math.round(outW * scale));
  const h = Math.max(1, Math.round(outH * scale));

  const dst: [Point, Point, Point, Point] = [
    { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
  ];
  const mapToSrc = computeInverseHomography(corners, dst);

  const srcCanvas = document.createElement("canvas");
  const srcW = img.width, srcH = img.height;
  if (!srcW || !srcH) return null;
  srcCanvas.width = srcW; srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) return null;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = w; outCanvas.height = h;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return null;
  const outData = outCtx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { x: sx, y: sy } = mapToSrc(x, y);
      const ix = Math.round(sx), iy = Math.round(sy);
      const outIdx = (y * w + x) * 4;
      if (ix < 0 || iy < 0 || ix >= srcW || iy >= srcH || !Number.isFinite(sx) || !Number.isFinite(sy)) {
        outData.data[outIdx + 3] = 0; // out of source bounds — transparent
        continue;
      }
      const srcIdx = (iy * srcW + ix) * 4;
      outData.data[outIdx] = srcData.data[srcIdx];
      outData.data[outIdx + 1] = srcData.data[srcIdx + 1];
      outData.data[outIdx + 2] = srcData.data[srcIdx + 2];
      outData.data[outIdx + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}
