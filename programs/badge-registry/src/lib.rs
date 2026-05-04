//! BlindSol — Badge Registry program.
//!
//! Holds public badge records on Solana. Each Badge account stores ONLY
//! public metadata (kind, issued_at, an opaque commitment to the owner's
//! anon seed). Notice what is NOT here: the wallet pubkey of the holder,
//! or anything that would link an issued badge back to a specific user.
//!
//! The wallet ↔ anon link lives off-chain in the API's TEE. All on-chain
//! ever sees is `(kind, sha256(anon_seed), index, ts)`.
//!
//! ── MagicBlock Private Ephemeral Rollup delegation ──
//!
//! Newly minted badges are immediately delegated to a MagicBlock PER via
//! `delegate_badge`. Once delegated:
//!   - mutations to the badge account go through the rollup at sub-50ms
//!     and are TEE-attested
//!   - the L1 Solana account is locked (writes only succeed via the ER)
//!   - state can be committed back via `undelegate_badge` (called from
//!     inside the ER) when we want to surface changes to L1
//!
//! For now badges are read-only after mint, so delegation is mainly a
//! foundation for upcoming lifecycle features (revoke / slash / expire)
//! that we want to run privately. The privacy story stays the same; the
//! latency and confidentiality of *future* mutations get a giant upgrade.

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

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

    /// Delegate a freshly minted badge account to the MagicBlock PER.
    ///
    /// After this CPI, the on-chain Badge PDA is locked from the L1
    /// program's perspective; any writes must go through the rollup.
    /// `kind_bytes` and `badge_index` are passed so the SDK can rebuild
    /// the seeds of the PDA being delegated.
    ///
    /// Requires `authority` (the registry authority) to sign — same key
    /// that minted the badge — so only the issuer can delegate.
    pub fn delegate_badge(
        ctx: Context<DelegateBadge>,
        kind_bytes: [u8; 32],
        badge_index: u64,
    ) -> Result<()> {
        let badge_index_le = badge_index.to_le_bytes();
        let seeds: &[&[u8]] = &[BADGE_SEED, &kind_bytes, &badge_index_le];

        ctx.accounts.delegate_badge(
            &ctx.accounts.authority,
            seeds,
            DelegateConfig::default(),
        )?;
        Ok(())
    }

    /// Undelegate (commit + return to L1) a badge that was previously
    /// delegated. Called from INSIDE the ER — the MagicBlock validator is
    /// the only entity that can route this instruction. Used when we
    /// finalize lifecycle changes back to mainnet.
    pub fn undelegate_badge(ctx: Context<UndelegateBadge>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.authority,
            vec![&ctx.accounts.badge.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
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

/// Delegation context. The `#[delegate]` macro generates the actual
/// CPI helper (`delegate_badge`) and validates the account layout the
/// MagicBlock Delegation Program expects.
#[delegate]
#[derive(Accounts)]
pub struct DelegateBadge<'info> {
    pub authority: Signer<'info>,
    /// CHECK: validated by the delegation SDK; must be the Badge PDA
    /// previously created by mint_badge.
    #[account(mut, del)]
    pub badge: AccountInfo<'info>,
}

/// Commit-and-undelegate context. Runs inside the ER — `magic_context`
/// + `magic_program` are routed by the MagicBlock validator.
#[commit]
#[derive(Accounts)]
pub struct UndelegateBadge<'info> {
    pub authority: Signer<'info>,
    /// CHECK: validated by the SDK; must be a delegated Badge PDA.
    #[account(mut)]
    pub badge: AccountInfo<'info>,
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
