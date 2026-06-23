"use client";

import { useId, useMemo } from "react";

/**
 * Anonymous-badge seal — a deterministic SVG sigil derived from a hash string.
 * Calm accent-green strokes on a light surface, concentric layers, hash-driven
 * radial glyphs, and a small solid core. It is the brand's subtle
 * anonymous-identity primitive — used in place of a portrait avatar. Static by
 * default; pass `animate` to enable the slow rotation.
 */
function hashToInts(hash: string, count = 12): number[] {
  const out: number[] = [];
  const clean = (hash || "anon").replace(/[^0-9a-f]/gi, "0").padEnd(count * 2, "0");
  for (let i = 0; i < count; i++) {
    const slice = clean.slice(i * 2, i * 2 + 2);
    out.push(parseInt(slice, 16) || (i + 1) * 17);
  }
  return out;
}

interface HoloSealProps {
  hash: string;
  size?: number;
  color?: string;
  animate?: boolean;
}

export function HoloSeal({ hash, size = 36, color, animate = false }: HoloSealProps) {
  const ints = useMemo(() => hashToInts(hash, 12), [hash]);
  const reactId = useId();
  const id = reactId.replace(/[^a-z0-9]/gi, "");
  const c = color || "var(--acid)";
  const cx = 50;
  const cy = 50;

  const ticks = 24;
  const tickArr = Array.from({ length: ticks }, (_, i) => {
    const angle = (i / ticks) * 360;
    const long = (ints[i % ints.length] & 1) === 1;
    return { angle, long };
  });

  const bars = 16;
  const barArr = Array.from({ length: bars }, (_, i) => {
    const angle = (i / bars) * 360;
    const len = 4 + ((ints[(i + 3) % ints.length] >> 4) & 0x7);
    return { angle, len };
  });

  const glyph = ints.slice(0, 6).map((n) => n / 255);

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "inline-block",
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <radialGradient id={`grad-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={c} stopOpacity="0.08" />
            <stop offset="60%" stopColor={c} stopOpacity="0.02" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </radialGradient>
          <clipPath id={`clip-${id}`}>
            <circle cx={cx} cy={cy} r="46" />
          </clipPath>
        </defs>

        <circle cx={cx} cy={cy} r="46" fill={`url(#grad-${id})`} />

        <g
          style={
            animate
              ? { transformOrigin: "50px 50px", animation: "bs-spin 60s linear infinite" }
              : undefined
          }
        >
          <circle
            cx={cx}
            cy={cy}
            r="46"
            fill="none"
            stroke={c}
            strokeWidth="0.5"
            strokeOpacity="0.4"
          />
          {tickArr.map((t, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy - 46}
              x2={cx}
              y2={cy - (t.long ? 42 : 44.5)}
              stroke={c}
              strokeWidth={t.long ? 0.8 : 0.4}
              strokeOpacity={t.long ? 0.7 : 0.3}
              transform={`rotate(${t.angle} ${cx} ${cy})`}
            />
          ))}
        </g>

        <g
          style={
            animate
              ? { transformOrigin: "50px 50px", animation: "bs-spin-rev 38s linear infinite" }
              : undefined
          }
        >
          <circle
            cx={cx}
            cy={cy}
            r="33"
            fill="none"
            stroke={c}
            strokeWidth="0.4"
            strokeOpacity="0.4"
            strokeDasharray="1 2"
          />
          {barArr.map((b, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy - 33}
              x2={cx}
              y2={cy - 33 + b.len}
              stroke={c}
              strokeWidth="0.7"
              strokeOpacity="0.7"
              transform={`rotate(${b.angle} ${cx} ${cy})`}
            />
          ))}
        </g>

        <circle
          cx={cx}
          cy={cy}
          r="22"
          fill="none"
          stroke={c}
          strokeWidth="0.4"
          strokeOpacity="0.5"
        />

        <g clipPath={`url(#clip-${id})`}>
          <polygon
            points={glyph
              .map((g, i) => {
                const a = (i / glyph.length) * Math.PI * 2 - Math.PI / 2;
                const r = 8 + g * 10;
                return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
              })
              .join(" ")}
            fill="none"
            stroke={c}
            strokeWidth="0.9"
            strokeLinejoin="miter"
            style={
              animate
                ? { transformOrigin: "50px 50px", animation: "bs-spin 24s linear infinite" }
                : undefined
            }
          />
          <polygon
            points={glyph
              .map((g, i) => {
                const a = (i / glyph.length) * Math.PI * 2 - Math.PI / 2;
                const r = 5 + g * 6;
                return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
              })
              .join(" ")}
            fill="none"
            stroke={c}
            strokeWidth="0.5"
            strokeOpacity="0.6"
            style={
              animate
                ? { transformOrigin: "50px 50px", animation: "bs-spin-rev 18s linear infinite" }
                : undefined
            }
          />
        </g>

        <circle
          cx={cx}
          cy={cy}
          r="2.2"
          fill={c}
          style={animate ? { animation: "bs-pulse 2.4s ease-in-out infinite" } : undefined}
        />
      </svg>
    </div>
  );
}

/**
 * Verified-holder marker — a small accent check glyph. Shows a quiet "verified
 * holder" label by default (post detail / profile); pass `label={false}` for a
 * glyph-only badge in dense lists like the feed, where the title carries the
 * meaning for assistive tech.
 */
export function VerifiedDot({ size = 12, label = true }: { size?: number; label?: boolean }) {
  return (
    <span
      title="Verified holder"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: "var(--acid)",
        fontSize: 11,
      }}
    >
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        style={{ display: "block", flexShrink: 0 }}
        aria-label={label ? undefined : "Verified holder"}
        role={label ? undefined : "img"}
        aria-hidden={label ? true : undefined}
      >
        <path d="M3 8.5 L6.5 12 L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label ? "verified holder" : null}
    </span>
  );
}
