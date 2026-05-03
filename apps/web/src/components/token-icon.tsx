"use client";

import { useState } from "react";
import { logoUrl, tokenFor } from "@/lib/tokens";

interface TokenIconProps {
  kind: string;
  size?: number;
  className?: string;
}

/**
 * Token logo with a colored-initial fallback. Uses plain <img> on purpose:
 * the logo CDNs are arweave/ipfs/various and not all whitelisted in next.config.
 */
export function TokenIcon({ kind, size = 28, className = "" }: TokenIconProps) {
  const meta = tokenFor(kind);
  const [errored, setErrored] = useState(false);

  if (!meta) {
    return (
      <span
        aria-hidden
        className={`inline-block rounded-full bg-surface-2 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = meta.symbol.slice(0, 2);

  const url = logoUrl(meta);

  if (errored) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(9, Math.floor(size * 0.4)),
          background: `${meta.color}1f`,
          color: meta.color,
          border: `1px solid ${meta.color}40`,
        }}
        aria-label={meta.symbol}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={meta.symbol}
      onError={() => setErrored(true)}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-full bg-surface-2 ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 1px ${meta.color}30`,
      }}
    />
  );
}
