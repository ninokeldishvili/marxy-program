# Implementation notes

Notes from building the Marxy program (2026-10-09; updated 2026-10-10 for the revised spec: platform minimum margin, sales close + get-ready period, battle start; updated 2026-10-11: the get-ready period moved into the config). The rules, instructions, PDAs and how-to-run steps are in [README.md](README.md). This file records the state of the work, the decisions that went beyond the spec, and the open items.

## State at hand-off

- Toolchain: Anchor CLI 1.1.2, Solana CLI 3.1.10, Rust 1.89 for the program (`rust-toolchain.toml`). The `anchor-lang` / `anchor-spl` crates are pinned to `=1.1.2` to match the CLI (the scaffold had resolved 1.2.1).
- `anchor build`: clean, no warnings. `cargo clippy --all-targets`: 0 warnings.
- `anchor test` (runs `cargo test`): 15 of 15 LiteSVM integration tests pass against `target/deploy/marxy.so`. They use a 23% minimum margin (lot value 100 USDC → sales minimum 123 USDC, so at least 13 capped players).
- `scripts/fund-lot.ts`: type-checks (`yarn typecheck`) and starts correctly, but it has **not** been run against a cluster (nothing was deployed).
- No git commands were run and nothing was deployed.

## What was built

| Part | Location |
|------|----------|
| Program (10 instructions, constants, state, events, errors) | `programs/marxy/src/` |
| Test harness (mock mints, clock control, instruction builders) | `programs/marxy/tests/common/mod.rs` |
| Scenario tests | `programs/marxy/tests/auction.rs` |
| Backend funding script (Jupiter or `--mock`) | `scripts/fund-lot.ts` |
| Docs | `README.md`, this file |

Tests: the 10 required scenarios, plus config management (margin changes, admin rotation), mint validation, a pre-created lot vault, a fee-on-transfer Token-2022 lot, and a wrong treasury at settle.

## Decisions beyond the spec

1. **First caller becomes admin.** `initialize_config` makes its signer the admin. Run it immediately after deploying, or someone else could claim the config. (An alternative is to restrict it to the program's upgrade authority.)
2. **Extra auction fields.**
   - `usdc_mint`: each auction keeps its own mint, so changing the config's USDC mint can't break running auctions.
   - `original_sales_close`: the 1-hour postpone window is measured from it, even after sales close moves.
3. **`fund_lot` uses `init_if_needed` for the lot vault.** Anyone can create the auction PDA's lot token account in advance. A plain `init` would then fail and block funding. Instead the program checks that the vault grew by exactly `lot_amount`, which also rejects Token-2022 lots with transfer fees (`LotNotDeposited`).
4. **Lot mint ≠ USDC mint** is enforced at creation (`InvalidLotMint`), since both vaults would otherwise be the same account.
5. **Settle empties whole vaults,** including donated tokens, so the vaults can be closed. Vault rent goes to the treasury.
6. **When vaults close:**
   - Settled: both vaults close at settle.
   - No bids: the lot vault closes at settle.
   - Refund mode: the USDC vault closes on the last participant's withdraw, or immediately if there are no participants.
7. **Totals track held funds.** Refunds (while postponed, or in Refunding) subtract from `revenue` and `total_credits_sold`. `participant_count` counts open participant accounts. History lives in the events.
8. **Recipient accounts in settle** are validated against the derived ATA addresses and created on demand (paid by the caller), for both the lot recipient and the treasury's USDC account.
9. **Window boundaries.** Funding is allowed for `sales_close <= now < battle_start`, and settling into `NotFunded` from `now >= battle_start`, so the two never overlap. Bidding is allowed for `battle_start <= now < end_time`, and settling a funded auction once `now >= end_time`. The postpone window is inclusive (`<= original_sales_close + 1 h`), and the matching settle path opens at `> original_sales_close + 1 h`.
10. **Countdown reset** follows the spec literally: `end_time = now + countdown`, even when that's earlier than what's left of the opening window.
11. **Battle start is derived, not stored:** `Auction::battle_start()` = `sales_close + get_ready_secs`, where the auction copied `get_ready_secs` from the config at creation (so a config change never moves a running auction's battle start). It's emitted in `AuctionCreated`, `AuctionPostponed` and `LotFunded` so the UI and backend don't have to compute it.
12. **Margin rounding and snapshot.** The required sales minimum is `ceil(lot_value × (10_000 + min_margin_bps) / 10_000)`, computed in u128, so rounding never lets an auction undercut the margin. It's checked only at creation; changing `min_margin_bps` later doesn't affect existing auctions, which keep their stored `sales_minimum`. There is no upper bound on `min_margin_bps` (a u16, at most 655%).
13. **Errors for "too early" / "too late":** `SalesStillOpen` (fund or settle before sales close), `FundingClosed` (fund at or after battle start), `FundingWindowOpen` (settle into NotFunded before battle start), `BattleNotStarted` (bid before battle start). Cancelling at or after sales close returns `SalesLocked`.
14. **Extra error names:** `ThresholdAlreadyMet`, `PostponeWindowClosed`, `PostponeTooFar`, `InvalidNewSalesClose`, `SalesCloseInPast`, `SalesStillOpen`, `AuctionNotActive`, `LotNotDeposited`, `InvalidLotMint`, `InvalidUsdcMint`, `MissingAccount`, `ZeroCredits`, `ZeroLotValue`, `ZeroOpeningWindow`, `MathOverflow`. `PlatformCannotBid` covers both buying and bidding by the admin or treasury.

15. **Get-ready period in the config** (2026-10-11): `Config::get_ready_secs`, set by `initialize_config` and changed by `update_config`, bounded to 60–3600 s (`MIN_GET_READY_SECS` / `MAX_GET_READY_SECS`, `InvalidGetReadySecs`). It replaced the compile-time `GET_READY_SECS` constant and the `demo-timers` feature. Both account layouts changed, so the program moved to a new ID (`eFXAZBc…tcCF`) instead of upgrading `Y8ue…zpA` in place. The build no longer matches the previously verified hash `7fb51699…fe0f`; verify the new deployment again.

## Known behaviours and caveats

- **A second `settle`** fails with Anchor's `AccountNotInitialized` (3012) rather than a custom error, because the USDC vault is already closed.
- **A donated USDC remainder** in refund mode stays in the vault, which then isn't closed.
- **Admin and treasury changes** apply live to every auction, because instructions read `config` at call time. A rotated-out admin or treasury becomes a regular wallet and may play.
- **Withdrawals while postponed** can drop sales back below the minimum. The auction then settles into refunds at the new sales close.
- **`fund-lot.ts` timing** uses the machine's clock to pre-check the get-ready window; the program enforces it with the on-chain clock, which can drift by a few seconds. Don't start a purchase in the last seconds before battle start.
- **Account loading comes first:** Anchor loads accounts before running constraints. For example, an admin buying with no USDC account gets `AccountNotInitialized` instead of `PlatformCannotBid`. The exclusion still holds.
- **`fund-lot.ts`** defaults to `https://lite-api.jup.ag/swap/v1`. Set `JUP_API_URL` / `JUP_API_KEY` if your Jupiter plan uses another endpoint. Without `--yes`, the mainnet path only prints its plan. It caps spending at the auction's revenue unless you pass `--max-usdc`.
- **Anchor.toml** has a top-level `skip_local_validator = true` from the Anchor 1.1.2 scaffold, so `anchor test` just runs `cargo test`.

## Before deploying

1. Generate your own program keypair. The one in `target/deploy/` came from the scaffold:
   `solana-keygen new -o target/deploy/marxy-keypair.json --force && anchor keys sync && anchor build`
2. Deploy, then call `initialize_config` straight away (see decision 1).
3. Run `scripts/fund-lot.ts --mock` on devnet end-to-end before relying on it. Then do a small mainnet dry run (without `--yes`) to confirm the Jupiter quote path.

## Possible follow-ups

- Restrict `initialize_config` to the program upgrade authority.
- Give a second `settle` a clear custom error (e.g. make `usdc_vault` optional and check the status first).
- A sweep or close instruction for USDC vaults left holding donated dust in refund mode.
- A small TS client for `initialize_config` / `create_auction`, so the devnet setup is fully scripted.
- Validate `new_usdc_mint` in `update_config` by passing the mint account instead of a bare pubkey.
