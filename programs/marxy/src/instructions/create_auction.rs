use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    error::MarxyError,
    events::AuctionCreated,
    state::{battle_start, Auction, AuctionStatus, Config},
    utils::now,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateAuctionParams {
    pub auction_id: u64,
    pub lot_amount: u64,
    pub lot_value: u64,
    pub credit_price: u64,
    pub sales_minimum: u64,
    pub sales_close: i64,
    pub opening_window: i64,
    pub countdown: i64,
}

#[derive(Accounts)]
#[instruction(params: CreateAuctionParams)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ MarxyError::Unauthorized
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Auction::INIT_SPACE,
        seeds = [AUCTION_SEED, &params.auction_id.to_le_bytes()],
        bump
    )]
    pub auction: Box<Account<'info, Auction>>,
    #[account(constraint = lot_mint.key() != usdc_mint.key() @ MarxyError::InvalidLotMint)]
    pub lot_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        address = config.usdc_mint @ MarxyError::InvalidUsdcMint,
        mint::token_program = usdc_token_program
    )]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = auction,
        associated_token::token_program = usdc_token_program
    )]
    pub usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_auction(
    ctx: Context<CreateAuction>,
    params: CreateAuctionParams,
) -> Result<()> {
    require!(params.lot_amount > 0, MarxyError::ZeroLotAmount);
    require!(params.lot_value > 0, MarxyError::ZeroLotValue);
    require!(params.credit_price > 0, MarxyError::ZeroCreditPrice);
    require!(params.countdown > 0, MarxyError::ZeroCountdown);
    require!(params.opening_window > 0, MarxyError::ZeroOpeningWindow);
    require!(params.sales_close > now()?, MarxyError::SalesCloseInPast);

    // Guaranteed profit: sales minimum >= ceil(lot value * (1 + minimum margin)).
    let required_minimum = (params.lot_value as u128)
        .checked_mul(
            BPS_DENOMINATOR
                .checked_add(ctx.accounts.config.min_margin_bps as u64)
                .ok_or(MarxyError::MathOverflow)? as u128,
        )
        .and_then(|v| v.checked_add(BPS_DENOMINATOR as u128 - 1))
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .ok_or(MarxyError::MathOverflow)?;
    require!(
        params.sales_minimum as u128 >= required_minimum,
        MarxyError::ThresholdBelowMargin
    );
    let get_ready_secs = ctx.accounts.config.get_ready_secs;
    let battle_start = battle_start(params.sales_close, get_ready_secs)?;

    // floor(lot value * 10% / credit price), computed in u128 to avoid overflow.
    let max_credits_per_player = (params.lot_value as u128)
        .checked_mul(MAX_PLAYER_SHARE_BPS as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .and_then(|v| v.checked_div(params.credit_price as u128))
        .ok_or(MarxyError::MathOverflow)?;
    let max_credits_per_player =
        u64::try_from(max_credits_per_player).map_err(|_| MarxyError::MathOverflow)?;
    require!(max_credits_per_player >= 1, MarxyError::CreditPriceTooHigh);

    let auction = &mut ctx.accounts.auction;
    auction.set_inner(Auction {
        auction_id: params.auction_id,
        lot_mint: ctx.accounts.lot_mint.key(),
        lot_amount: params.lot_amount,
        lot_value: params.lot_value,
        usdc_mint: ctx.accounts.usdc_mint.key(),
        credit_price: params.credit_price,
        max_credits_per_player,
        sales_minimum: params.sales_minimum,
        sales_close: params.sales_close,
        original_sales_close: params.sales_close,
        get_ready_secs,
        opening_window: params.opening_window,
        countdown: params.countdown,
        end_time: 0,
        funded: false,
        funded_time: 0,
        total_credits_sold: 0,
        revenue: 0,
        participant_count: 0,
        bid_count: 0,
        last_bidder: Pubkey::default(),
        status: AuctionStatus::Active,
        postponed: false,
        bump: ctx.bumps.auction,
    });

    emit!(AuctionCreated {
        auction: auction.key(),
        auction_id: params.auction_id,
        lot_mint: auction.lot_mint,
        lot_amount: auction.lot_amount,
        lot_value: auction.lot_value,
        credit_price: auction.credit_price,
        max_credits_per_player,
        sales_minimum: auction.sales_minimum,
        sales_close: auction.sales_close,
        battle_start,
        opening_window: auction.opening_window,
        countdown: auction.countdown,
    });
    Ok(())
}
