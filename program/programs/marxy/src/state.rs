use anchor_lang::prelude::*;

use crate::{
    constants::{MAX_GET_READY_SECS, MIN_GET_READY_SECS},
    error::MarxyError,
};

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Signs every platform action (create / postpone / cancel / fund).
    pub admin: Pubkey,
    /// Receives revenue, returned lots and vault rent.
    pub treasury: Pubkey,
    /// USDC mint used for credits in new auctions.
    pub usdc_mint: Pubkey,
    /// Minimum margin over the lot value that every sales minimum must cover,
    /// in basis points (2300 = 23%).
    pub min_margin_bps: u16,
    /// Get-ready period for new auctions, in seconds: battle start is
    /// `sales_close + get_ready_secs`. Each auction keeps the value it was created with.
    pub get_ready_secs: i64,
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
    /// Current sales close (moves once if postponed). Battle start is
    /// `sales_close + get_ready_secs`.
    pub sales_close: i64,
    /// Sales close as created; the postpone window is measured from it.
    pub original_sales_close: i64,
    /// Get-ready period copied from the config at creation, so later config
    /// changes never move the battle start of an existing auction.
    pub get_ready_secs: i64,
    /// Seconds after battle start in which the first bid must land.
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

    /// When bidding opens: the end of the get-ready period.
    pub fn battle_start(&self) -> Result<i64> {
        battle_start(self.sales_close, self.get_ready_secs)
    }
}

pub fn battle_start(sales_close: i64, get_ready_secs: i64) -> Result<i64> {
    sales_close
        .checked_add(get_ready_secs)
        .ok_or_else(|| error!(MarxyError::MathOverflow))
}

pub fn validate_get_ready_secs(secs: i64) -> Result<()> {
    require!(
        (MIN_GET_READY_SECS..=MAX_GET_READY_SECS).contains(&secs),
        MarxyError::InvalidGetReadySecs
    );
    Ok(())
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
