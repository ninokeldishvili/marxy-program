use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::MarxyError,
    events::AuctionPostponed,
    state::{Auction, AuctionStatus, Config},
    utils::now,
};

#[derive(Accounts)]
pub struct Postpone<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ MarxyError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [AUCTION_SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Account<'info, Auction>,
}

pub fn handle_postpone(ctx: Context<Postpone>, new_start_time: i64) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    let now = now()?;
    require!(
        auction.status == AuctionStatus::Active,
        MarxyError::AuctionNotActive
    );
    require!(!auction.postponed, MarxyError::AlreadyPostponed);
    require!(!auction.funded, MarxyError::AlreadyFunded);
    require!(
        !auction.sales_minimum_met(),
        MarxyError::ThresholdAlreadyMet
    );
    let deadline = auction
        .original_start_time
        .checked_add(POSTPONE_GRACE_SECONDS)
        .ok_or(MarxyError::MathOverflow)?;
    require!(now <= deadline, MarxyError::PostponeWindowClosed);
    require!(
        new_start_time > now && new_start_time > auction.start_time,
        MarxyError::InvalidNewStart
    );
    let latest = now
        .checked_add(MAX_POSTPONE_SECONDS)
        .ok_or(MarxyError::MathOverflow)?;
    require!(new_start_time <= latest, MarxyError::PostponeTooFar);

    let old_start_time = auction.start_time;
    auction.start_time = new_start_time;
    auction.postponed = true;

    emit!(AuctionPostponed {
        auction: auction.key(),
        old_start_time,
        new_start_time,
    });
    Ok(())
}
