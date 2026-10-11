use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::MarxyError,
    state::{validate_get_ready_secs, Config},
};

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ MarxyError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

/// Fields left as `None` are unchanged. A new USDC mint, minimum margin or
/// get-ready period only applies to auctions created afterwards; existing
/// auctions keep what they stored.
pub fn handle_update_config(
    ctx: Context<UpdateConfig>,
    new_admin: Option<Pubkey>,
    new_treasury: Option<Pubkey>,
    new_usdc_mint: Option<Pubkey>,
    new_min_margin_bps: Option<u16>,
    new_get_ready_secs: Option<i64>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    if let Some(admin) = new_admin {
        config.admin = admin;
    }
    if let Some(treasury) = new_treasury {
        config.treasury = treasury;
    }
    if let Some(usdc_mint) = new_usdc_mint {
        config.usdc_mint = usdc_mint;
    }
    if let Some(min_margin_bps) = new_min_margin_bps {
        config.min_margin_bps = min_margin_bps;
    }
    if let Some(get_ready_secs) = new_get_ready_secs {
        validate_get_ready_secs(get_ready_secs)?;
        config.get_ready_secs = get_ready_secs;
    }
    Ok(())
}
