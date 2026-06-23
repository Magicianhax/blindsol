# Design Sync Notes

Notes for the next `/design-sync` run against the source design-system repo.
This file is additive — it does **not** touch the protected, synced `_ds_bundle.css`.

## Open: `check_design_system` warnings caused by Tailwind internals

`check_design_system` currently flags two groups of "tokens" in `_ds_bundle.css`.
Both are **Tailwind's own internal variables, not design tokens**, so they should
not be treated as theme tokens or moved to `:root`. The fix belongs in the source
repo (applied during sync), because `_ds_bundle.css` is read-only here and any
edits made in this project get overwritten on the next sync.

### 1. 58 properties under component selectors

Scoped to pseudo-elements / utility selectors by design:
`::backdrop`, `::before`, `::after`, `.space-y-1 > …`, etc.

These are Tailwind preflight/utility variables — `--tw-ring-*`,
`--tw-space-y-reverse`, and friends. They are intentionally scoped to those
selectors and must **not** be promoted to `:root`.

### 2. 43 unclassified tokens

Transform / ring / scroll-snap machinery:
`--tw-translate-x`, `--tw-rotate`, `--tw-skew-x`, `--tw-pan-x`, …

These are the same Tailwind internals and are not categorizable as design tokens.

## Durable fix (apply in the source repo during `/design-sync`)

Do **one** of the following so `check_design_system` reports clean:

1. **Exclude** Tailwind's `--tw-*` preflight/transform vars from the token scan
   (they aren't design tokens), **or**
2. **Auto-tag** them `/* @kind other */` so they register as intentionally
   uncategorized.

Either approach clears the warning at the source, so the change survives future syncs.
