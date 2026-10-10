use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{get_associated_token_address_with_program_id, AssociatedToken},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    error::MarxyError,
    events::{AuctionRefunding, AuctionSettled},
    state::{Auction, AuctionStatus, Config, RefundReason},
    utils::{close_vault, create_ata_idempotent, now, vault_transfer},
};

/// Anyone may call. The lot accounts are only needed once the lot was funded,
/// and `treasury_usdc` only when there is a winner.
#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [AUCTION_SEED, &auction.auction_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Box<Account<'info, Auction>>,
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
    pub usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: the treasury's USDC ATA; address checked and created if missing in the handler.
    #[account(mut)]
    pub treasury_usdc: Option<UncheckedAccount<'info>>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub lot_mint: Option<Box<InterfaceAccount<'info, Mint>>>,
    #[account(mut)]
    pub lot_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    /// CHECK: the wallet receiving the lot: the last bidder, or the treasury
    /// when nobody bid. Checked in the handler.
    pub lot_recipient: Option<UncheckedAccount<'info>>,
    /// CHECK: `lot_recipient`'s lot ATA; address checked and created if missing in the handler.
    #[account(mut)]
    pub lot_recipient_token: Option<UncheckedAccount<'info>>,
    pub lot_token_program: Option<Interface<'info, TokenInterface>>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_settle(ctx: Context<Settle>) -> Result<()> {
    let now = now()?;
    let auction = &ctx.accounts.auction;
    require!(
        auction.status == AuctionStatus::Active,
        MarxyError::AuctionNotActive
    );

    if auction.funded {
        require!(now >= auction.end_time, MarxyError::AuctionNotEnded);
        let has_winner = auction.bid_count > 0;
        let expected_recipient = if has_winner {
            auction.last_bidder
        } else {
            ctx.accounts.treasury.key()
        };
        move_lot(&ctx, expected_recipient)?;

        if has_winner {
            pay_treasury(&ctx)?;
            let auction = &mut ctx.accounts.auction;
            auction.status = AuctionStatus::Settled;
            emit!(AuctionSettled {
                auction: auction.key(),
                winner: auction.last_bidder,
                lot_amount: auction.lot_amount,
                revenue: auction.revenue,
                bid_count: auction.bid_count,
            });
        } else {
            enter_refunding(ctx, RefundReason::NoBids)?;
        }
        return Ok(());
    }

    require!(now >= auction.sales_close, MarxyError::SalesStillOpen);
    if auction.sales_minimum_met() {
        // Not funded by battle start.
        require!(
            now >= auction.battle_start()?,
            MarxyError::FundingWindowOpen
        );
        enter_refunding(ctx, RefundReason::NotFunded)
    } else {
        // Short at sales close: the admin may still postpone (once) within
        // the grace period; a postponed auction settles at its new close.
        if !auction.postponed {
            let deadline = auction
                .original_sales_close
                .checked_add(POSTPONE_GRACE_SECONDS)
                .ok_or(MarxyError::MathOverflow)?;
            require!(now > deadline, MarxyError::PostponeWindowOpen);
        }
        enter_refunding(ctx, RefundReason::SalesMinimumMissed)
    }
}

/// Send the whole lot vault to `expected_recipient`'s ATA and close the vault.
fn move_lot(ctx: &Context<Settle>, expected_recipient: Pubkey) -> Result<()> {
    let accounts = &ctx.accounts;
    let auction = &accounts.auction;
    let lot_mint = accounts
        .lot_mint
        .as_ref()
        .ok_or(MarxyError::MissingAccount)?;
    let lot_vault = accounts
        .lot_vault
        .as_ref()
        .ok_or(MarxyError::MissingAccount)?;
    let recipient = accounts
        .lot_recipient
        .as_ref()
        .ok_or(MarxyError::MissingAccount)?;
    let recipient_token = accounts
        .lot_recipient_token
        .as_ref()
        .ok_or(MarxyError::MissingAccount)?;
    let token_program = accounts
        .lot_token_program
        .as_ref()
        .ok_or(MarxyError::MissingAccount)?;

    require_keys_eq!(lot_mint.key(), auction.lot_mint, MarxyError::InvalidLotMint);
    require_keys_eq!(
        *lot_mint.to_account_info().owner,
        token_program.key(),
        MarxyError::InvalidLotMint
    );
    require_keys_eq!(
        lot_vault.key(),
        get_associated_token_address_with_program_id(
            &auction.key(),
            &lot_mint.key(),
            &token_program.key()
        ),
        MarxyError::MissingAccount
    );
    require_keys_eq!(
        recipient.key(),
        expected_recipient,
        MarxyError::WrongRecipient
    );
    require_keys_eq!(
        recipient_token.key(),
        get_associated_token_address_with_program_id(
            &recipient.key(),
            &lot_mint.key(),
            &token_program.key()
        ),
        MarxyError::WrongRecipient
    );

    create_ata_idempotent(
        accounts.caller.to_account_info(),
        recipient_token.to_account_info(),
        recipient.to_account_info(),
        lot_mint.to_account_info(),
        accounts.system_program.to_account_info(),
        token_program.to_account_info(),
    )?;

    let id = auction.auction_id.to_le_bytes();
    let seeds: &[&[u8]] = &[AUCTION_SEED, &id, &[auction.bump]];
    vault_transfer(
        token_program.key(),
        lot_vault.to_account_info(),
        lot_mint.to_account_info(),
        recipient_token.to_account_info(),
        auction.to_account_info(),
        &[seeds],
        lot_vault.amount,
        lot_mint.decimals,
    )?;
    close_vault(
        token_program.key(),
        lot_vault.to_account_info(),
        accounts.treasury.to_account_info(),
        auction.to_account_info(),
        &[seeds],
    )
}

/// Send all USDC revenue to the treasury's ATA and close the USDC vault.
fn pay_treasury(ctx: &Context<Settle>) -> Result<()> {
    let accounts = &ctx.accounts;
    let auction = &accounts.auction;
    let treasury_usdc = accounts
        .treasury_usdc
        .as_ref()
        .ok_or(MarxyError::MissingAccount)?;
    require_keys_eq!(
        treasury_usdc.key(),
        get_associated_token_address_with_program_id(
            &accounts.treasury.key(),
            &accounts.usdc_mint.key(),
            &accounts.usdc_token_program.key()
        ),
        MarxyError::WrongRecipient
    );

    create_ata_idempotent(
        accounts.caller.to_account_info(),
        treasury_usdc.to_account_info(),
        accounts.treasury.to_account_info(),
        accounts.usdc_mint.to_account_info(),
        accounts.system_program.to_account_info(),
        accounts.usdc_token_program.to_account_info(),
    )?;

    let id = auction.auction_id.to_le_bytes();
    let seeds: &[&[u8]] = &[AUCTION_SEED, &id, &[auction.bump]];
    vault_transfer(
        accounts.usdc_token_program.key(),
        accounts.usdc_vault.to_account_info(),
        accounts.usdc_mint.to_account_info(),
        treasury_usdc.to_account_info(),
        auction.to_account_info(),
        &[seeds],
        accounts.usdc_vault.amount,
        accounts.usdc_mint.decimals,
    )?;
    close_vault(
        accounts.usdc_token_program.key(),
        accounts.usdc_vault.to_account_info(),
        accounts.treasury.to_account_info(),
        auction.to_account_info(),
        &[seeds],
    )
}

fn enter_refunding(ctx: Context<Settle>, reason: RefundReason) -> Result<()> {
    // With nobody to refund, the USDC vault is already empty: close it now.
    if ctx.accounts.auction.participant_count == 0 && ctx.accounts.usdc_vault.amount == 0 {
        let auction = &ctx.accounts.auction;
        let id = auction.auction_id.to_le_bytes();
        let seeds: &[&[u8]] = &[AUCTION_SEED, &id, &[auction.bump]];
        close_vault(
            ctx.accounts.usdc_token_program.key(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            auction.to_account_info(),
            &[seeds],
        )?;
    }
    let auction = &mut ctx.accounts.auction;
    auction.status = AuctionStatus::Refunding;
    emit!(AuctionRefunding {
        auction: auction.key(),
        reason,
    });
    Ok(())
}
