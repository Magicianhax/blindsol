//! BlindSol — Badge Registry program (Phase 10b).
//!
//! Holds public badge records on Solana. Each Badge account stores ONLY
//! public metadata (kind, issued_at, an opaque commitment to the owner's
//! anon seed). Notice what is NOT here: the wallet pubkey of the holder,
//! or anything that would link an issued badge back to a specific user.
//!
//! The wallet ↔ anon link lives off-chain (in the API's PER state, eventually
//! a real MagicBlock PER delegation in Phase 10c). All on-chain ever sees is
//! `(kind, sha256(anon_seed), index, ts)`.

use anchor_lang::prelude::*;

declare_id!("Gm6YCGTivfUqtGFoajbdueC3zKSKQM9rXHDNxvP1bJXU");

const REGISTRY_SEED: &[u8] = b"registry";
const BADGE_SEED: &[u8] = b"badge";

#[program]
pub mod badge_registry {
    use super::*;

    /// One-time initialization. Sets the global authority — typically the
    /// API's badge-issuance keypair.
    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        let r = &mut ctx.accounts.registry;
        r.authority = ctx.accounts.authority.key();
        r.next_index = 0;
        r.bump = ctx.bumps.registry;
        Ok(())
    }

    /// Issue a new badge. `kind_bytes` is a 32-byte zero-padded ASCII label
    /// (e.g. "jup_holder"). `owner_commitment` is sha256(anon_seed) — proves
    /// the issuer holds a secret that hashes to this value, but reveals
    /// nothing about the wallet that earned the badge.
    pub fn mint_badge(
        ctx: Context<MintBadge>,
        kind_bytes: [u8; 32],
        owner_commitment: [u8; 32],
    ) -> Result<()> {
        let r = &mut ctx.accounts.registry;
        let badge = &mut ctx.accounts.badge;

        badge.index = r.next_index;
        badge.kind = kind_bytes;
        badge.owner_commitment = owner_commitment;
        badge.issued_at = Clock::get()?.unix_timestamp;
        badge.bump = ctx.bumps.badge;

        r.next_index = r.next_index.checked_add(1).ok_or(BadgeError::IndexOverflow)?;
        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Registry::SIZE,
        seeds = [REGISTRY_SEED],
        bump,
    )]
    pub registry: Account<'info, Registry>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(kind_bytes: [u8; 32])]
pub struct MintBadge<'info> {
    #[account(
        mut,
        seeds = [REGISTRY_SEED],
        bump = registry.bump,
        has_one = authority,
    )]
    pub registry: Account<'info, Registry>,

    #[account(
        init,
        payer = authority,
        space = 8 + Badge::SIZE,
        seeds = [BADGE_SEED, &kind_bytes, &registry.next_index.to_le_bytes()],
        bump,
    )]
    pub badge: Account<'info, Badge>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ─── State ──────────────────────────────────────────────────────────

#[account]
pub struct Registry {
    pub authority: Pubkey,
    pub next_index: u64,
    pub bump: u8,
}

impl Registry {
    pub const SIZE: usize = 32 + 8 + 1;
}

#[account]
pub struct Badge {
    pub index: u64,
    pub kind: [u8; 32],
    /// sha256 of the anon seed assigned to the owner. Lets anyone verify
    /// "this badge was issued for some anon seed" without revealing it.
    pub owner_commitment: [u8; 32],
    pub issued_at: i64,
    pub bump: u8,
}

impl Badge {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1;
}

#[error_code]
pub enum BadgeError {
    #[msg("badge index overflow")]
    IndexOverflow,
}
