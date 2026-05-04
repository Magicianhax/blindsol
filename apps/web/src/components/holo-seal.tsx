"use client";

import { useId, useMemo } from "react";

/**
 * Holographic anonymous-badge seal — deterministic, animated SVG sigil
 * derived from a hash string. Style: monochrome acid-green strokes on dark,
 * rotating concentric layers, hash-driven radial glyphs, subtle pulsing
 * core. The visual is the brand's primary anonymous-identity primitive —
 * we use it instead of a portrait avatar.
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

export function HoloSeal({ hash, size = 36, color, animate = true }: HoloSealProps) {
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
            <stop offset="0%" stopColor={c} stopOpacity="0.25" />
            <stop offset="60%" stopColor={c} stopOpacity="0.04" />
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
            strokeOpacity="0.5"
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
              strokeOpacity={t.long ? 0.95 : 0.35}
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

/** Verified-holder dot — small acid pill with mono caps label. */
export function VerifiedDot({ size = 7 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: "var(--acid)",
        fontSize: 9,
        fontFamily: "var(--font-mono), JetBrains Mono, monospace",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--acid)",
          boxShadow: "0 0 6px var(--acid-line)",
        }}
      />
      verified holder
    </span>
  );
}
