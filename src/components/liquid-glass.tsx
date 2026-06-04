"use client";

import { useEffect, useState } from "react";

/**
 * Progressive-enhancement edge refraction for `.glass-refract` surfaces.
 *
 * True Liquid-Glass lensing needs an SVG feDisplacementMap used as a
 * backdrop-filter — which only works in Chromium. So we:
 *   1. generate a squircle displacement map (edge-concentrated) on a canvas,
 *   2. inject an SVG filter that displaces the backdrop + adds a specular blend,
 *   3. flip html[data-refract="1"] ONLY on Chromium.
 * Everywhere else (Safari/iPhone, Firefox) the class falls back to the layered
 * `.glass` look — no broken rendering.
 */

const SIZE = 160;        // displacement map resolution (low-res is fine)
const EDGE = 0.62;       // where lensing starts (0..1 of the squircle distance)
const STRENGTH = 1.0;    // displacement vector magnitude near the edge

function buildDisplacementMap(): string {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(SIZE, SIZE);
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x / (SIZE - 1)) * 2 - 1; // -1..1
      const ny = (y / (SIZE - 1)) * 2 - 1;
      // squircle distance — neutral in the centre, rises toward the rim
      const d = Math.pow(Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4), 0.25);
      const k = smooth(EDGE, 1.0, d) * STRENGTH;
      const dx = nx * k;
      const dy = ny * k;
      const i = (y * SIZE + x) * 4;
      img.data[i] = Math.round(128 + dx * 127);     // R = x displacement
      img.data[i + 1] = Math.round(128 + dy * 127); // G = y displacement
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function isChromium(): boolean {
  const uaData = (navigator as { userAgentData?: { brands?: { brand: string }[] } }).userAgentData;
  if (uaData?.brands?.length) {
    return uaData.brands.some((b) => /Chromium|Google Chrome/i.test(b.brand));
  }
  // Fallback UA sniff: desktop Chromium engines, excluding iOS wrappers
  // (CriOS/EdgiOS are still Safari's engine and don't support SVG backdrops).
  const ua = navigator.userAgent;
  return /Chrome\/|Chromium\//.test(ua) && !/CriOS|EdgiOS|FxiOS/.test(ua);
}

export function LiquidGlassDefs() {
  const [mapUrl, setMapUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // The displacement map is needed for element `filter` too (works in Safari),
    // so generate it everywhere. `data-refract` still gates the Chromium-only
    // backdrop-filter usage on `.glass-refract`.
    document.documentElement.dataset.refract = isChromium() && "CSS" in window ? "1" : "0";
    try {
      const url = buildDisplacementMap();
      if (url) setMapUrl(url);
    } catch { /* fall back to plain glass */ }
  }, []);

  if (!mapUrl) return null;
  return (
    <svg width="0" height="0" aria-hidden style={{ position: "absolute", pointerEvents: "none" }}>
      <defs>
        {/* Backdrop lens (Chromium only — used by .glass-refract as backdrop-filter). */}
        <filter id="cos-liquid-glass" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feImage href={mapUrl} result="map" preserveAspectRatio="none" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="14" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Element lens (works in Safari via `filter:`): edge refraction + chromatic
            aberration — the R/G/B channels are displaced by different amounts so the
            content fringes at the curved edges, like real glass. */}
        <filter id="cos-lens-refract" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feImage href={mapUrl} result="map" preserveAspectRatio="none" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="22" xChannelSelector="R" yChannelSelector="G" result="dR" />
          <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cR" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="15" xChannelSelector="R" yChannelSelector="G" result="dG" />
          <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cG" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="9" xChannelSelector="R" yChannelSelector="G" result="dB" />
          <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cB" />
          <feBlend in="cR" in2="cG" mode="screen" result="rg" />
          <feBlend in="rg" in2="cB" mode="screen" />
        </filter>
      </defs>
    </svg>
  );
}
