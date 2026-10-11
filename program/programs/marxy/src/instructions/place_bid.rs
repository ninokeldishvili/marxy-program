use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::MarxyError,
    events::BidPlaced,
    state::{Auction, AuctionStatus, Participant},
    utils::now,
};

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    pub bidder: Signer<'info>,
    #[account(
        mut,
        seeds = [AUCTION_SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Account<'info, Auction>,
    #[account(
        mut,
        seeds = [PARTICIPANT_SEED, auction.key().as_ref(), bidder.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,
}

pub fn handle_place_bid(ctx: Context<PlaceBid>) -> Result<()> {
    let now = now()?;
    let auction = &mut ctx.accounts.auction;
    let participant = &mut ctx.accounts.participant;
    let bidder = ctx.accounts.bidder.key();

    require!(
        auction.status == AuctionStatus::Active,
        MarxyError::AuctionNotActive
    );
    require!(auction.funded, MarxyError::NotFunded);
    require!(now >= auction.battle_start()?, MarxyError::BattleNotStarted);
    require!(now < auction.end_time, MarxyError::BiddingEnded);
    require!(participant.credits_left >= 1, MarxyError::NoCreditsLeft);
    require!(auction.last_bidder != bidder, MarxyError::AlreadyLastBidder);

    participant.credits_left = participant
        .credits_left
        .checked_sub(1)
        .ok_or(MarxyError::MathOverflow)?;
    auction.bid_count = auction
        .bid_count
        .checked_add(1)
        .ok_or(MarxyError::MathOverflow)?;
    auction.last_bidder = bidder;
    auction.end_time = now
        .checked_add(auction.countdown)
        .ok_or(MarxyError::MathOverflow)?;

    emit!(BidPlaced {
        auction: auction.key(),
        bidder,
        credits_left: participant.credits_left,
        end_time: auction.end_time,
        bid_count: auction.bid_count,
    });
    Ok(())
}
