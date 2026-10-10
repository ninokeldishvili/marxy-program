use anchor_lang::prelude::*;

#[error_code]
pub enum MarxyError {
    #[msg("Only the platform admin may perform this action")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Lot amount must be greater than zero")]
    ZeroLotAmount,
    #[msg("Lot value must be greater than zero")]
    ZeroLotValue,
    #[msg("Credit price must be greater than zero")]
    ZeroCreditPrice,
    #[msg("Countdown must be greater than zero")]
    ZeroCountdown,
    #[msg("Opening window must be greater than zero")]
    ZeroOpeningWindow,
    #[msg("Sales close must be in the future")]
    SalesCloseInPast,
    #[msg("Sales minimum must be at least the lot value plus the platform minimum margin")]
    ThresholdBelowMargin,
    #[msg("One credit costs more than the per-player cap (10% of the lot value)")]
    CreditPriceTooHigh,
    #[msg("The lot mint cannot be the USDC mint")]
    InvalidLotMint,
    #[msg("The USDC mint does not match the platform config")]
    InvalidUsdcMint,
    #[msg("The auction is not active")]
    AuctionNotActive,
    #[msg("Credit sales are closed")]
    SalesLocked,
    #[msg("Credit sales are still open")]
    SalesStillOpen,
    #[msg("Must buy at least one credit")]
    ZeroCredits,
    #[msg("Purchase exceeds the per-player credit cap")]
    CreditLimitExceeded,
    #[msg("The platform admin and treasury cannot participate")]
    PlatformCannotBid,
    #[msg("Sales minimum has not been met")]
    ThresholdNotMet,
    #[msg("Sales minimum has already been met")]
    ThresholdAlreadyMet,
    #[msg("The auction has already been postponed once")]
    AlreadyPostponed,
    #[msg("The postpone window has closed")]
    PostponeWindowClosed,
    #[msg("The postpone window is still open")]
    PostponeWindowOpen,
    #[msg("New sales close must be in the future and later than the current one")]
    InvalidNewSalesClose,
    #[msg("New sales close is too far in the future")]
    PostponeTooFar,
    #[msg("The lot has already been funded")]
    AlreadyFunded,
    #[msg("The lot has not been funded")]
    NotFunded,
    #[msg("Funding closed: the battle has started")]
    FundingClosed,
    #[msg("The lot can still be funded until battle start")]
    FundingWindowOpen,
    #[msg("The lot vault does not hold the full lot")]
    LotNotDeposited,
    #[msg("The battle has not started yet")]
    BattleNotStarted,
    #[msg("No credits left")]
    NoCreditsLeft,
    #[msg("You are already the last bidder")]
    AlreadyLastBidder,
    #[msg("Bidding has ended")]
    BiddingEnded,
    #[msg("The auction has not ended yet")]
    AuctionNotEnded,
    #[msg("Lot recipient does not match the auction outcome")]
    WrongRecipient,
    #[msg("A required account is missing")]
    MissingAccount,
    #[msg("Withdrawals are not possible while the auction is active")]
    AuctionStillActive,
}
