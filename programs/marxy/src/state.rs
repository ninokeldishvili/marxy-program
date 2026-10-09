use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Signs every platform action (create / postpone / cancel / fund).
    pub admin: Pubkey,
    /// Receives revenue, returned lots and vault rent.
    pub treasury: Pubkey,
    /// USDC mint used for credits in new auctions.
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum AuctionStatus {
    Active,
    Settled,
    Refunding,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RefundReason {
    Cancelled,
    SalesMinimumMissed,
    NotFunded,
    NoBids,
}

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub auction_id: u64,
    pub lot_mint: Pubkey,
    /// Lot size in the lot mint's base units.
    pub lot_amount: u64,
    /// Lot value in USDC base units, fixed at creation.
    pub lot_value: u64,
    /// USDC mint this auction was created with (the config may change later).
    pub usdc_mint: Pubkey,
    /// Price of one credit in USDC base units.
    pub credit_price: u64,
    pub max_credits_per_player: u64,
    /// USDC that must be sold for the auction to run.
    pub sales_minimum: u64,
    /// Current start time (moves once if postponed).
    pub start_time: i64,
    /// Start time as created; the postpone window is measured from it.
    pub original_start_time: i64,
    /// Seconds before the first bid must land, counted from funding.
    pub opening_window: i64,
    /// Seconds each bid adds from "now".
    pub countdown: i64,
    /// 0 until funded; then the time bidding closes.
    pub end_time: i64,
    pub funded: bool,
    pub funded_time: i64,
    pub total_credits_sold: u64,
    /// USDC currently held for this auction's credits.
    pub revenue: u64,
    /// Open participant accounts.
    pub participant_count: u32,
    pub bid_count: u64,
    /// Default pubkey until the first bid.
    pub last_bidder: Pubkey,
    pub status: AuctionStatus,
    pub postponed: bool,
    pub bump: u8,
}

impl Auction {
    pub fn sales_minimum_met(&self) -> bool {
        self.revenue >= self.sales_minimum
    }
}

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub auction: Pubkey,
    pub player: Pubkey,
    pub credits_bought: u64,
    pub credits_left: u64,
    pub bump: u8,
}
