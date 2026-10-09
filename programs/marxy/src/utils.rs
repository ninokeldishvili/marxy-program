use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, CloseAccount, TransferChecked};

use crate::error::MarxyError;

pub fn now() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}

/// Transfer tokens out of a vault owned by the auction PDA.
#[allow(clippy::too_many_arguments)]
pub fn vault_transfer<'info>(
    token_program: Pubkey,
    vault: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    auction: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    amount: u64,
    decimals: u8,
) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program,
            TransferChecked {
                from: vault,
                mint,
                to,
                authority: auction,
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )
}

/// Close an empty vault owned by the auction PDA, sending its rent to `destination`.
pub fn close_vault<'info>(
    token_program: Pubkey,
    vault: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    auction: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token_interface::close_account(CpiContext::new_with_signer(
        token_program,
        CloseAccount {
            account: vault,
            destination,
            authority: auction,
        },
        signer_seeds,
    ))
}

pub fn checked_cost(credits: u64, price: u64) -> Result<u64> {
    credits
        .checked_mul(price)
        .ok_or_else(|| error!(MarxyError::MathOverflow))
}

/// Create `owner`'s associated token account for `mint` if it doesn't exist yet.
pub fn create_ata_idempotent<'info>(
    payer: AccountInfo<'info>,
    ata: AccountInfo<'info>,
    owner: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
) -> Result<()> {
    anchor_spl::associated_token::create_idempotent(CpiContext::new(
        anchor_spl::associated_token::ID,
        anchor_spl::associated_token::Create {
            payer,
            associated_token: ata,
            authority: owner,
            mint,
            system_program,
            token_program,
        },
    ))
}
