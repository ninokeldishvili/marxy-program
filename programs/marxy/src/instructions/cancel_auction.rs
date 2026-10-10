use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::*,
    error::MarxyError,
    events::AuctionRefunding,
    state::{Auction, AuctionStatus, Config, RefundReason},
    utils::{close_vault, now},
};

#[derive(Accounts)]
pub struct CancelAuction<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ MarxyError::Unauthorized
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [AUCTION_SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Box<Account<'info, Auction>>,
    /// CHECK: must be the configured treasury wallet; receives vault rent.
    #[account(mut, address = config.treasury @ MarxyError::WrongRecipient)]
    pub treasury: UncheckedAccount<'info>,
    #[account(address = auction.usdc_mint @ MarxyError::InvalidUsdcMint)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = auction,
        associated_token::token_program = usdc_token_program
    )]
    pub usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
    let auction = &ctx.accounts.auction;
    require!(
        auction.status == AuctionStatus::Active,
        MarxyError::AuctionNotActive
    );
    require!(now()? < auction.sales_close, MarxyError::SalesLocked);

    if auction.participant_count == 0 && ctx.accounts.usdc_vault.amount == 0 {
        let id = auction.auction_id.to_le_bytes();
        let seeds: &[&[u8]] = &[AUCTION_SEED, &id, &[auction.bump]];
        close_vault(
            ctx.accounts.usdc_token_program.key(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            auction.to_account_info(),
            &[seeds],
        )?;
    }

    let auction = &mut ctx.accounts.auction;
    auction.status = AuctionStatus::Refunding;
    emit!(AuctionRefunding {
        auction: auction.key(),
        reason: RefundReason::Cancelled,
    });
    Ok(())
}
