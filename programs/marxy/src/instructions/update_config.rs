use anchor_lang::prelude::*;

use crate::{constants::*, error::MarxyError, state::Config};

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

/// Fields left as `None` are unchanged. A new USDC mint only applies to
/// auctions created afterwards; existing auctions keep the mint they stored.
pub fn handle_update_config(
    ctx: Context<UpdateConfig>,
    new_admin: Option<Pubkey>,
    new_treasury: Option<Pubkey>,
    new_usdc_mint: Option<Pubkey>,
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
    Ok(())
}
