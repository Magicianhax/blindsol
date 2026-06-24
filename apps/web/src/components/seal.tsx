"use client";

import { useEffect, useRef } from "react";

/**
 * Seal — a deterministic cryptographic sigil rendered to a canvas, seeded from
 * a hash string. Ported from the BlindSol design prototype's seal.js. The same
 * hash always produces the same geometric mark, so it works as a stable,
 * wallet-free identity avatar (anon id → sigil).
 *
 * Color defaults to the inherited CSS color of the wrapping `.seal-sm` element
 * (the terracotta accent), or pass `color` to override (used by the pfp picker).
 */

function makeRng(seed: string): () => number {
  let s = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    s ^= seed.charCodeAt(i);
    s = Math.imul(s, 16777619) >>> 0;
  }
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawSeal(canvas: HTMLCanvasElement, hash: string, size: number, color: string) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  canvas.style.display = "block";
  const x = canvas.getContext("2d");
  if (!x) return;
  x.clearRect(0, 0, canvas.width, canvas.height);
  x.save();
  x.scale(dpr, dpr);
  const r = makeRng(hash || "seed");
  const col = color || "#fff";
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.42;
  x.lineCap = "round";

  // concentric rings with broken arcs
  for (let ring = 0; ring < 3; ring++) {
    const rad = R * (0.42 + ring * 0.29);
    x.globalAlpha = 0.3 + ring * 0.16;
    x.lineWidth = Math.max(1, size * 0.012);
    x.strokeStyle = col;
    const segs = 6 + ring * 3;
    for (let i = 0; i < segs; i++) {
      if (r() < 0.42) continue;
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = a0 + ((Math.PI * 2) / segs) * 0.78;
      x.beginPath();
      x.arc(cx, cy, rad, a0, a1);
      x.stroke();
    }
  }

  // radial spokes
  const spokes = 12;
  for (let s2 = 0; s2 < spokes; s2++) {
    if (r() < 0.5) continue;
    const ang = (s2 / spokes) * Math.PI * 2;
    const r0 = R * 0.3;
    const r1 = R * (0.7 + r() * 0.5);
    x.globalAlpha = 0.5;
    x.lineWidth = size * 0.01;
    x.strokeStyle = col;
    x.beginPath();
    x.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    x.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
    x.stroke();
    if (r() < 0.5) {
      x.globalAlpha = 0.9;
      x.fillStyle = col;
      x.beginPath();
      x.arc(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1, size * 0.018, 0, 7);
      x.fill();
    }
  }

  // center sigil — filled polygon
  x.globalAlpha = 1;
  x.fillStyle = col;
  const pts = 3 + Math.floor(r() * 4);
  const cr = R * 0.22;
  const rot = r() * Math.PI;
  x.beginPath();
  for (let p = 0; p < pts; p++) {
    const pa = rot + (p / pts) * Math.PI * 2;
    const px = cx + Math.cos(pa) * cr;
    const py = cy + Math.sin(pa) * cr;
    if (p) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.closePath();
  x.fill();

  // inner negative dot
  x.globalCompositeOperation = "destination-out";
  x.beginPath();
  x.arc(cx, cy, cr * 0.42, 0, 7);
  x.fill();
  x.globalCompositeOperation = "source-over";
  x.restore();
}

export function Seal({
  hash,
  size = 32,
  color,
  className,
}: {
  hash: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const col = color || getComputedStyle(c).color || "#fff";
    drawSeal(c, hash, size, col);
  }, [hash, size, color]);

  return (
    <span
      className={`seal-sm${className ? " " + className : ""}`}
      style={color ? { color } : undefined}
      role="img"
      aria-label={`Anonymous seal ${hash.slice(0, 6)}`}
    >
      <canvas ref={ref} style={{ width: size, height: size }} />
    </span>
  );
}
