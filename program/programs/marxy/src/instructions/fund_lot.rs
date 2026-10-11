use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    error::MarxyError,
    events::LotFunded,
    state::{Auction, AuctionStatus, Config},
    utils::now,
};

#[derive(Accounts)]
pub struct FundLot<'info> {
    #[account(mut)]
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
    #[account(
        address = auction.lot_mint,
        mint::token_program = lot_token_program
    )]
    pub lot_mint: Box<InterfaceAccount<'info, Mint>>,
    /// The admin's lot tokens, bought just before through Jupiter.
    #[account(
        mut,
        token::mint = lot_mint,
        token::authority = admin,
        token::token_program = lot_token_program
    )]
    pub admin_lot_account: Box<InterfaceAccount<'info, TokenAccount>>,
    // init_if_needed: anyone can create an ATA for the auction PDA beforehand,
    // which must not be able to block funding.
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = lot_mint,
        associated_token::authority = auction,
        associated_token::token_program = lot_token_program
    )]
    pub lot_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub lot_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_fund_lot(ctx: Context<FundLot>) -> Result<()> {
    let now = now()?;
    let auction = &ctx.accounts.auction;
    require!(
        auction.status == AuctionStatus::Active,
        MarxyError::AuctionNotActive
    );
    require!(!auction.funded, MarxyError::AlreadyFunded);
    // Get-ready period: sales close <= now < battle start.
    require!(now >= auction.sales_close, MarxyError::SalesStillOpen);
    let battle_start = auction.battle_start()?;
    require!(now < battle_start, MarxyError::FundingClosed);
    require!(auction.sales_minimum_met(), MarxyError::ThresholdNotMet);

    let lot_amount = auction.lot_amount;
    let balance_before = ctx.accounts.lot_vault.amount;
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.lot_token_program.key(),
            TransferChecked {
                from: ctx.accounts.admin_lot_account.to_account_info(),
                mint: ctx.accounts.lot_mint.to_account_info(),
                to: ctx.accounts.lot_vault.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        lot_amount,
        ctx.accounts.lot_mint.decimals,
    )?;

    // Verify the vault actually received the full lot (catches e.g. transfer fees).
    ctx.accounts.lot_vault.reload()?;
    let received = ctx
        .accounts
        .lot_vault
        .amount
        .checked_sub(balance_before)
        .ok_or(MarxyError::MathOverflow)?;
    require!(received == lot_amount, MarxyError::LotNotDeposited);

    let auction = &mut ctx.accounts.auction;
    auction.funded = true;
    auction.funded_time = now;
    // Bidding opens at battle start however early the lot arrived, so the
    // countdown players see is honest.
    auction.end_time = battle_start
        .checked_add(auction.opening_window)
        .ok_or(MarxyError::MathOverflow)?;

    emit!(LotFunded {
        auction: auction.key(),
        lot_amount,
        funded_time: now,
        battle_start,
        end_time: auction.end_time,
    });
    Ok(())
}
