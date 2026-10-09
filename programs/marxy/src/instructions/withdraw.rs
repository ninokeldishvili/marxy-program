use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::*,
    error::MarxyError,
    events::ParticipantClosed,
    state::{Auction, AuctionStatus, Config, Participant},
    utils::{checked_cost, close_vault, now, vault_transfer},
};

/// Closes the caller's participant account. `usdc_vault` and `player_usdc` are
/// only needed when USDC is refunded (Refunding, or Active while postponed).
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [AUCTION_SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Box<Account<'info, Auction>>,
    #[account(
        mut,
        close = player,
        seeds = [PARTICIPANT_SEED, auction.key().as_ref(), player.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Box<Account<'info, Participant>>,
    /// CHECK: must be the configured treasury wallet; receives vault rent.
    #[account(mut, address = config.treasury @ MarxyError::WrongRecipient)]
    pub treasury: UncheckedAccount<'info>,
    #[account(address = auction.usdc_mint @ MarxyError::InvalidUsdcMint)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = auction,
        associated_token::token_program = usdc_token_program
    )]
    pub usdc_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = player,
        token::token_program = usdc_token_program
    )]
    pub player_usdc: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>) -> Result<()> {
    let status = ctx.accounts.auction.status;
    let participant = &ctx.accounts.participant;
    let credits_bought = participant.credits_bought;
    let credits_left = participant.credits_left;

    let refund = match status {
        // Unused credits burn; only the account rent comes back.
        AuctionStatus::Settled => 0,
        AuctionStatus::Refunding => {
            checked_cost(credits_bought, ctx.accounts.auction.credit_price)?
        }
        AuctionStatus::Active => {
            let auction = &ctx.accounts.auction;
            require!(
                auction.postponed && now()? < auction.start_time,
                MarxyError::AuctionStillActive
            );
            checked_cost(credits_bought, auction.credit_price)?
        }
    };

    if refund > 0 {
        let vault = ctx
            .accounts
            .usdc_vault
            .as_ref()
            .ok_or(MarxyError::MissingAccount)?;
        let player_usdc = ctx
            .accounts
            .player_usdc
            .as_ref()
            .ok_or(MarxyError::MissingAccount)?;
        let auction = &ctx.accounts.auction;
        let id = auction.auction_id.to_le_bytes();
        let seeds: &[&[u8]] = &[AUCTION_SEED, &id, &[auction.bump]];
        vault_transfer(
            ctx.accounts.usdc_token_program.key(),
            vault.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            player_usdc.to_account_info(),
            auction.to_account_info(),
            &[seeds],
            refund,
            ctx.accounts.usdc_mint.decimals,
        )?;

        let auction = &mut ctx.accounts.auction;
        auction.total_credits_sold = auction
            .total_credits_sold
            .checked_sub(credits_bought)
            .ok_or(MarxyError::MathOverflow)?;
        auction.revenue = auction
            .revenue
            .checked_sub(refund)
            .ok_or(MarxyError::MathOverflow)?;
    }

    let auction = &mut ctx.accounts.auction;
    auction.participant_count = auction
        .participant_count
        .checked_sub(1)
        .ok_or(MarxyError::MathOverflow)?;

    // Last refund out: close the emptied USDC vault.
    if status == AuctionStatus::Refunding && auction.participant_count == 0 {
        let vault = ctx
            .accounts
            .usdc_vault
            .as_mut()
            .ok_or(MarxyError::MissingAccount)?;
        vault.reload()?;
        if vault.amount == 0 {
            let auction = &ctx.accounts.auction;
            let id = auction.auction_id.to_le_bytes();
            let seeds: &[&[u8]] = &[AUCTION_SEED, &id, &[auction.bump]];
            close_vault(
                ctx.accounts.usdc_token_program.key(),
                vault.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                auction.to_account_info(),
                &[seeds],
            )?;
        }
    }

    emit!(ParticipantClosed {
        auction: ctx.accounts.auction.key(),
        player: ctx.accounts.player.key(),
        refunded: refund,
        credits_burned: if status == AuctionStatus::Settled {
            credits_left
        } else {
            0
        },
    });
    Ok(())
}
