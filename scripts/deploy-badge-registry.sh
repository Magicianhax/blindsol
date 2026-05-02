#!/usr/bin/env bash
# Deploy the badge-registry Anchor program to devnet.
# Run from the repo root.
set -euo pipefail

export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

PROGRAM_SO="target/deploy/badge_registry.so"
PROGRAM_KEYPAIR="target/deploy/badge_registry-keypair.json"

if [ ! -f "$PROGRAM_SO" ]; then
  echo "missing $PROGRAM_SO — run 'cd programs/badge-registry && cargo build-sbf' first"
  exit 1
fi
if [ ! -f "$PROGRAM_KEYPAIR" ]; then
  echo "missing $PROGRAM_KEYPAIR — generate with solana-keygen"
  exit 1
fi

PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "[deploy] program id: $PROGRAM_ID"
echo "[deploy] cluster:    devnet"
echo "[deploy] payer:      $(solana-keygen pubkey ~/.config/solana/id.json) (balance: $(solana balance --url devnet))"
echo ""

solana program deploy \
  --url devnet \
  --keypair ~/.config/solana/id.json \
  --program-id "$PROGRAM_KEYPAIR" \
  "$PROGRAM_SO"

echo ""
echo "[deploy] done. Program id: $PROGRAM_ID"
echo "[deploy] add to .env:"
echo "  BADGE_PROGRAM_ID=$PROGRAM_ID"
echo "  BADGE_AUTHORITY_KEYPAIR=$HOME/.config/solana/id.json"
echo "  SOLANA_RPC_URL=https://api.devnet.solana.com"
