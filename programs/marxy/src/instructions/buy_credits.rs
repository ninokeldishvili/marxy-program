use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::*,
    error::MarxyError,
    events::CreditsBought,
    state::{Auction, AuctionStatus, Config, Participant},
    utils::{checked_cost, now},
};

#[derive(Accounts)]
pub struct BuyCredits<'info> {
    #[account(
        mut,
        constraint = player.key() != config.admin @ MarxyError::PlatformCannotBid,
        constraint = player.key() != config.treasury @ MarxyError::PlatformCannotBid
    )]
    pub player: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [AUCTION_SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Box<Account<'info, Auction>>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + Participant::INIT_SPACE,
        seeds = [PARTICIPANT_SEED, auction.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub participant: Box<Account<'info, Participant>>,
    #[account(address = auction.usdc_mint @ MarxyError::InvalidUsdcMint)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = player,
        token::token_program = usdc_token_program
    )]
    pub player_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = auction,
        associated_token::token_program = usdc_token_program
    )]
    pub usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_buy_credits(ctx: Context<BuyCredits>, credits: u64) -> Result<()> {
    require!(credits > 0, MarxyError::ZeroCredits);
    let auction = &mut ctx.accounts.auction;
    require!(
        auction.status == AuctionStatus::Active,
        MarxyError::AuctionNotActive
    );
    require!(now()? < auction.sales_close, MarxyError::SalesLocked);

    let participant = &mut ctx.accounts.participant;
    if participant.player == Pubkey::default() {
        participant.auction = auction.key();
        participant.player = ctx.accounts.player.key();
        participant.bump = ctx.bumps.participant;
        auction.participant_count = auction
            .participant_count
            .checked_add(1)
            .ok_or(MarxyError::MathOverflow)?;
    }

    let new_total = participant
        .credits_bought
        .checked_add(credits)
        .ok_or(MarxyError::MathOverflow)?;
    require!(
        new_total <= auction.max_credits_per_player,
        MarxyError::CreditLimitExceeded
    );
    let cost = checked_cost(credits, auction.credit_price)?;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.usdc_token_program.key(),
            TransferChecked {
                from: ctx.accounts.player_usdc.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.usdc_vault.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        ),
        cost,
        ctx.accounts.usdc_mint.decimals,
    )?;

    participant.credits_bought = new_total;
    participant.credits_left = participant
        .credits_left
        .checked_add(credits)
        .ok_or(MarxyError::MathOverflow)?;
    auction.total_credits_sold = auction
        .total_credits_sold
        .checked_add(credits)
        .ok_or(MarxyError::MathOverflow)?;
    auction.revenue = auction
        .revenue
        .checked_add(cost)
        .ok_or(MarxyError::MathOverflow)?;

    emit!(CreditsBought {
        auction: auction.key(),
        player: participant.player,
        credits,
        cost,
        player_credits: participant.credits_bought,
        total_credits_sold: auction.total_credits_sold,
        revenue: auction.revenue,
    });
    Ok(())
}
