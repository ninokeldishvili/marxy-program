use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const AUCTION_SEED: &[u8] = b"auction";

#[constant]
pub const PARTICIPANT_SEED: &[u8] = b"participant";

/// Basis-point denominator (100%).
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Maximum share of the lot value one wallet may buy in credits (10%).
#[constant]
pub const MAX_PLAYER_SHARE_BPS: u64 = 1_000;

/// How long after the original sales close the admin may still postpone (1 hour).
#[constant]
pub const POSTPONE_GRACE_SECONDS: i64 = 60 * 60;

/// How far ahead of "now" a postponed sales close may be (30 days).
#[constant]
pub const MAX_POSTPONE_SECONDS: i64 = 30 * 24 * 60 * 60;

/// Bounds for the get-ready period between sales close and battle start
/// (`Config::get_ready_secs`): 1 minute to 1 hour. The backend buys and funds
/// the lot during it, so it can't be shorter than a funding round trip.
#[constant]
pub const MIN_GET_READY_SECS: i64 = 60;

#[constant]
pub const MAX_GET_READY_SECS: i64 = 60 * 60;
