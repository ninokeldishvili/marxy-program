pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("Y8uexnWNeCDLe2fuZmL6bPArX3uKEhbaAgnij84EzpA");

#[program]
pub mod marxy {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::initialize_config::handle_initialize_config(ctx)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_admin: Option<Pubkey>,
        new_treasury: Option<Pubkey>,
        new_usdc_mint: Option<Pubkey>,
    ) -> Result<()> {
        instructions::update_config::handle_update_config(
            ctx,
            new_admin,
            new_treasury,
            new_usdc_mint,
        )
    }

    pub fn create_auction(ctx: Context<CreateAuction>, params: CreateAuctionParams) -> Result<()> {
        instructions::create_auction::handle_create_auction(ctx, params)
    }

    pub fn buy_credits(ctx: Context<BuyCredits>, credits: u64) -> Result<()> {
        instructions::buy_credits::handle_buy_credits(ctx, credits)
    }

    pub fn postpone(ctx: Context<Postpone>, new_start_time: i64) -> Result<()> {
        instructions::postpone::handle_postpone(ctx, new_start_time)
    }

    pub fn fund_lot(ctx: Context<FundLot>) -> Result<()> {
        instructions::fund_lot::handle_fund_lot(ctx)
    }

    pub fn place_bid(ctx: Context<PlaceBid>) -> Result<()> {
        instructions::place_bid::handle_place_bid(ctx)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        instructions::settle::handle_settle(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::handle_withdraw(ctx)
    }

    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        instructions::cancel_auction::handle_cancel_auction(ctx)
    }
}
