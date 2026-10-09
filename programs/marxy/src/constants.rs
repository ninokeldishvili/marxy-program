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

/// How long after the original start the admin may still postpone (1 hour).
#[constant]
pub const POSTPONE_GRACE_SECONDS: i64 = 60 * 60;

/// How far ahead of "now" a postponed start may be (30 days).
#[constant]
pub const MAX_POSTPONE_SECONDS: i64 = 30 * 24 * 60 * 60;

/// How long after the start the admin has to fund the lot (15 minutes).
#[constant]
pub const FUNDING_WINDOW_SECONDS: i64 = 15 * 60;
