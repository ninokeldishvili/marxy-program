use anchor_lang::prelude::*;

use crate::state::RefundReason;

#[event]
pub struct AuctionCreated {
    pub auction: Pubkey,
    pub auction_id: u64,
    pub lot_mint: Pubkey,
    pub lot_amount: u64,
    pub lot_value: u64,
    pub credit_price: u64,
    pub max_credits_per_player: u64,
    pub sales_minimum: u64,
    pub start_time: i64,
    pub opening_window: i64,
    pub countdown: i64,
}

#[event]
pub struct CreditsBought {
    pub auction: Pubkey,
    pub player: Pubkey,
    pub credits: u64,
    pub cost: u64,
    pub player_credits: u64,
    pub total_credits_sold: u64,
    pub revenue: u64,
}

#[event]
pub struct AuctionPostponed {
    pub auction: Pubkey,
    pub old_start_time: i64,
    pub new_start_time: i64,
}

#[event]
pub struct LotFunded {
    pub auction: Pubkey,
    pub lot_amount: u64,
    pub funded_time: i64,
    pub end_time: i64,
}

#[event]
pub struct BidPlaced {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub credits_left: u64,
    pub end_time: i64,
    pub bid_count: u64,
}

#[event]
pub struct AuctionSettled {
    pub auction: Pubkey,
    pub winner: Pubkey,
    pub lot_amount: u64,
    pub revenue: u64,
    pub bid_count: u64,
}

#[event]
pub struct AuctionRefunding {
    pub auction: Pubkey,
    pub reason: RefundReason,
}

#[event]
pub struct ParticipantClosed {
    pub auction: Pubkey,
    pub player: Pubkey,
    /// USDC returned to the player (0 after a settled auction).
    pub refunded: u64,
    /// Unused credits that were burned.
    pub credits_burned: u64,
}
