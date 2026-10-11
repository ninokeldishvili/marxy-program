use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{
    constants::*,
    state::{validate_get_ready_secs, Config},
};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// Becomes the platform admin.
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    /// CHECK: any wallet; only stored.
    pub treasury: UncheckedAccount<'info>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(
    ctx: Context<InitializeConfig>,
    min_margin_bps: u16,
    get_ready_secs: i64,
) -> Result<()> {
    validate_get_ready_secs(get_ready_secs)?;
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = ctx.accounts.treasury.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.min_margin_bps = min_margin_bps;
    config.get_ready_secs = get_ready_secs;
    config.bump = ctx.bumps.config;
    Ok(())
}
