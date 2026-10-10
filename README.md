# marxy-program

A Solana-based auction platform that transforms traditional penny/last-bid auctions into a fixed-resource strategy game.

Marxy is the only seller. It lists crypto **lots** (e.g. 0.5 BTC as cbBTC, or 10 SOL) that it doesn't own yet. Players buy **bid credits** in USDC for one specific auction until its **sales close**. If enough credits are sold, the backend buys the lot through Jupiter during the **get-ready** period and deposits it into the auction's on-chain vault. The period is set in the config (1 minute to 1 hour; 5 minutes recommended) and each auction keeps the value it was created with. Bidding opens at **battle start** (sales close + get-ready period). Players only see "Credit purchases are locked. Auction is ready to start in 5 mins. Get ready!"; the purchase itself isn't shown. Each bid costs one credit and resets a short countdown. When the countdown reaches zero, the last bidder wins the lot.

```
CREATE  ->  SELL  ->  LOCK  ->  GET READY (funding)  ->  BATTLE  ->  WIN
                  sales close           battle start = sales close + get_ready_secs
```

Built with Anchor 1.1.2 / Solana CLI 3.1.10. Program ID (keypair in `target/deploy/`): `eFXAZBczq33MQPwveUxMPP9SfNw5RAeVpdeNtZYtcCF`. The earlier program `Y8uexnWNeCDLe2fuZmL6bPArX3uKEhbaAgnij84EzpA` used a compile-time get-ready period and an older account layout; it stays on devnet but the app no longer uses it.

## Layout

```
programs/marxy/src/
  lib.rs              instruction entrypoints
  constants.rs        seeds and rule constants (10% cap, 1 h, 30 days, get-ready bounds 1 min to 1 h)
  state.rs            Config, Auction, Participant, AuctionStatus, RefundReason
  events.rs           events for the UI and backend
  error.rs            MarxyError
  utils.rs            vault transfer / close / ATA helpers
  instructions/       one file per instruction
programs/marxy/tests/ LiteSVM integration tests (load target/deploy/marxy.so)
scripts/fund-lot.ts   backend: buy the lot (Jupiter or --mock) and call fund_lot
app/                  demo app: Next.js + Phantom, worker, devnet setup and smoke test (see app/README.md)
```

## Demo app

`app/` is a Next.js app (Phantom, devnet) plus a backend worker that plays the platform's role: it lists lots, funds them, postpones, settles and runs optional demo bots. See [app/README.md](app/README.md).

The get-ready period is a config value, not a build option: set it with `initialize_config` and change it with `update_config` (demos typically use 2 minutes, production 5).

## Rules enforced on-chain

| # | Rule | Enforcement |
|---|------|-------------|
| 1 | **Lot.** The admin creates an auction with the lot mint, lot amount, lot value (USDC), credit price, sales minimum, sales close, opening window and countdown. Nothing is escrowed at creation. | `create_auction` |
| 2 | **Credit price** is fixed per auction and never changes. | stored once, no setter |
| 3 | **Buying.** Before sales close, in one or several purchases. USDC goes into the auction's USDC vault (ATA owned by the auction PDA). | `buy_credits` |
| 4 | **Per-player cap** = `floor(lot_value × 10% / credit_price)`, computed and stored at creation. If one credit costs more than 10% of the lot value, creation fails. | `MAX_PLAYER_SHARE_BPS`, `CreditLimitExceeded`, `CreditPriceTooHigh` |
| 5 | **Sales minimum (guaranteed profit)** ≥ `ceil(lot_value × (10_000 + min_margin_bps) / 10_000)`, using the config's minimum margin at creation time (checked math). Below it at sales close, the auction can't be funded or bid on, so every auction that runs is profitable. | `ThresholdBelowMargin`, `ThresholdNotMet` |
| 6 | **Postpone once** if below the minimum, any time before sales close until 1 h after the *original* sales close. New sales close: in the future, later than the current one, at most 30 days ahead; battle start moves with it. While postponed (before the new sales close), sales reopen and buyers may withdraw a full refund. If nobody postpones within the hour, or the postponed sales close also misses the minimum, anyone can settle into refunds. | `postpone`, `POSTPONE_GRACE_SECONDS`, `MAX_POSTPONE_SECONDS` |
| 7 | **Lock.** From sales close on (on-chain clock), buying fails. | `SalesLocked` |
| 8 | **Funding (get-ready period).** `battle_start = sales_close + auction.get_ready_secs`, copied from the config when the auction is created. With `sales_close <= now < battle_start` and the minimum met, the admin transfers exactly `lot_amount` into the lot vault. The program checks the vault received the full lot and records the funding time. `end_time = battle_start + opening_window`, however early the lot arrived. If not funded by battle start, anyone can settle into refunds. | `fund_lot`, `SalesStillOpen`, `FundingClosed`, `LotNotDeposited` |
| 9 | **Bidding** needs an active, funded auction, `now >= battle_start`, an unexpired countdown and ≥ 1 credit. It consumes one credit. The last bidder can't bid again. | `place_bid`, `NotFunded`, `BattleNotStarted`, `BiddingEnded`, `NoCreditsLeft`, `AlreadyLastBidder` |
| 10 | **Countdown.** The opening window applies to the first bid. Every bid sets `end_time = now + countdown`. Credits are fixed, so the auction always ends. | `place_bid` |
| 11 | **Settle** (anyone): see below. | `settle` |
| 12 | **Unused credits burn.** After a Settled auction, withdraw closes the participant account and returns only its rent. | `withdraw` |
| 13 | **Refunds.** In Refunding, withdraw returns everything the player paid, plus rent. | `withdraw` |
| 14 | **Cancel** only before sales close; the status becomes Refunding. | `cancel_auction`, `SalesLocked` |
| 15 | **Platform exclusion.** The admin and treasury can never buy credits. | `PlatformCannotBid` |

Window boundaries, chosen so that no two actions overlap:

| Action | Allowed when |
|--------|--------------|
| `buy_credits`, `cancel_auction` | `now < sales_close` |
| `fund_lot` | `sales_close <= now < battle_start` |
| settle into `NotFunded` | `now >= battle_start` |
| `place_bid` | `battle_start <= now < end_time` |
| settle a funded auction | `now >= end_time` |
| `postpone` | `now <= original_sales_close + 1 h` |
| settle into `SalesMinimumMissed` | `now >= sales_close`, and (not postponed) `now > original_sales_close + 1 h` |

### Settle outcomes

| Situation | Lot | USDC | Status |
|-----------|-----|------|--------|
| Funded, end time passed, someone bid | whole lot vault → last bidder's ATA (created if missing, paid by the caller) | whole USDC vault → treasury's USDC ATA (created if missing) | `Settled` |
| Funded, opening window passed, no bid | lot → treasury's ATA | stays for refunds | `Refunding` (`NoBids`) |
| Not funded, minimum missed (postpone window over, or postponed sales close reached) | none | stays for refunds | `Refunding` (`SalesMinimumMissed`) |
| Not funded, minimum met, battle start reached | none | stays for refunds | `Refunding` (`NotFunded`) |

The lot recipient is checked on-chain: it must be the last bidder when there's a winner and the treasury otherwise (`WrongRecipient`). The lot and treasury-USDC accounts are `Option`al, so the refund-mode paths can omit them. Emptied vaults are closed and their rent goes to the treasury. In refund mode the USDC vault is closed by the last participant's withdraw (or right away when there are no participants).

## Instructions

| Instruction | Signer | Notes |
|-------------|--------|-------|
| `initialize_config(min_margin_bps, get_ready_secs)` | first admin | Creates the `["config"]` singleton with admin = signer, treasury, USDC mint, minimum margin (e.g. 2300 = 23%) and get-ready period (60 to 3600 s, else `InvalidGetReadySecs`). Run it right after deploying (see "Deploy to devnet"). |
| `update_config(new_admin?, new_treasury?, new_usdc_mint?, new_min_margin_bps?, new_get_ready_secs?)` | admin | `None` leaves a field unchanged. Each auction stores its own USDC mint, sales minimum and get-ready period, so changing the mint, the margin or the period only affects new auctions. |
| `create_auction(params)` | admin | `params = { auction_id, lot_amount, lot_value, credit_price, sales_minimum, sales_close, opening_window, countdown }`. Creates the auction PDA and its USDC vault (rent paid by the admin). |
| `buy_credits(credits)` | player | Creates the participant account on first purchase (`init_if_needed`). |
| `postpone(new_sales_close)` | admin | Once, only below the minimum (see rule 6). |
| `fund_lot()` | admin | During the get-ready period. Moves `lot_amount` from the admin's lot token account into the lot vault (created here, or reused if someone already created the ATA). |
| `place_bid()` | player | |
| `settle()` | anyone | |
| `withdraw()` | player | Settled: rent only. Refunding, or Active while postponed and before the new sales close: full USDC refund + rent. Otherwise `AuctionStillActive`. |
| `cancel_auction()` | admin | Before sales close only. |

SPL Token and Token-2022 mints are both supported through the token interface (USDC and lot programs are independent). A Token-2022 lot mint whose transfer fee keeps the vault from receiving the full lot is rejected at funding (`LotNotDeposited`).

### Events

`AuctionCreated { sales_close, battle_start, … }`, `CreditsBought`, `AuctionPostponed { new_sales_close, new_battle_start }`, `LotFunded { funded_time, battle_start, end_time }`, `BidPlaced { bidder, credits_left, end_time, bid_count }`, `AuctionSettled`, `AuctionRefunding { reason: Cancelled | SalesMinimumMissed | NotFunded | NoBids }`, `ParticipantClosed { refunded, credits_burned }`.

## Accounts and PDAs

| Account | Address | Contents |
|---------|---------|----------|
| Config | PDA `["config"]` | `admin`, `treasury`, `usdc_mint`, `min_margin_bps`, `get_ready_secs`, `bump` |
| Auction | PDA `["auction", auction_id (u64 LE)]` | id, lot mint/amount/value, USDC mint, credit price, max credits per player, sales minimum, sales close (current and original), get-ready period (battle start = sales close + get-ready period), opening window, countdown, end time, funded flag/time, total credits sold, revenue, participant count, bid count, last bidder, status, postponed flag, bump |
| Participant | PDA `["participant", auction, player]` | auction, player, credits bought, credits left, bump |
| USDC vault | ATA(USDC mint, auction PDA) | created in `create_auction` |
| Lot vault | ATA(lot mint, auction PDA) | created in `fund_lot` |

`revenue` and `total_credits_sold` count the USDC and credits currently held for the auction. Refunds (while postponed or in Refunding) subtract from them, and `participant_count` counts open participant accounts.

## How the backend funds a lot

1. Listen for `AuctionCreated` / `CreditsBought` / `AuctionPostponed` (or poll the auction account) to track `sales_close`, `revenue` and `sales_minimum`.
2. At `sales_close`, if `revenue >= sales_minimum`, buy the lot and call `fund_lot` before battle start (`sales_close + get_ready_secs`):

   ```bash
   # mainnet: Jupiter quote (USDC -> lot, ExactOut), swap from the admin wallet, then fund_lot
   RPC_URL=https://... ADMIN_KEYPAIR=~/admin.json yarn fund-lot --auction-id 1 --yes \
     [--slippage-bps 50] [--max-usdc <usdc base units>]

   # devnet / demo: skip Jupiter and mint the lot from a test mint the admin controls
   RPC_URL=https://api.devnet.solana.com yarn fund-lot --auction-id 1 --mock
   ```

   Without `--yes`, the mainnet path only prints its plan. The USDC it may spend defaults to the auction's revenue (`--max-usdc` overrides). The script tops up only what the admin doesn't already hold. Set `JUP_API_URL` / `JUP_API_KEY` to choose the Jupiter endpoint (default `https://lite-api.jup.ag/swap/v1`).
3. The program never talks to Jupiter. It only checks that the admin deposited the right amount. Credit revenue is never released before the winner is paid, so the platform fronts the purchase from its own funds and recovers it at settlement.
4. After `end_time`, anyone (the backend, or a crank) calls `settle`.

## Build and test

Prerequisites: Rust, Solana CLI 3.1.x, Anchor CLI 1.1.2, Node ≥ 20 + yarn.

```bash
anchor build        # builds target/deploy/marxy.so, the IDL and TS types
anchor test         # runs `cargo test` against the built .so (see Anchor.toml [scripts])
# or directly:
cargo test -p marxy
```

The tests (`programs/marxy/tests/`) use LiteSVM. They load `target/deploy/marxy.so`, use a mock USDC mint and a mock lot mint (SPL Token and Token-2022), simulate the backend purchase by minting the lot to the admin, and move the on-chain clock. Coverage:

1. Full happy path: split purchases, the cap, the lock, funding before sales close, bidding before funding and before battle start, non-admin / underfunded funding, the opening window counted from battle start, countdown resets, no credits, double bid, bid after expiry, early settle, wrong recipient, payout, and a loser's rent-only withdraw.
2. Missed sales minimum (above the lot value but below the 23% margin): funding and bidding are blocked, settle is blocked inside the postpone window and works after it, with full refunds.
3. Postpone once: invalid and second postpones fail, battle start moves, a buyer withdraws while postponed, new buyers fill the minimum, and the auction funds, runs and settles.
4. Postponed and still short: refunds from the new sales close.
5. Lot not funded by battle start: funding at battle start fails; settle fails before it and works from it.
6. Funded but no bids: the lot goes back to the treasury, with full refunds.
7. Credits running out: the auction ends exactly one countdown after the last bid.
8. Cancel rules and admin-only creation.
9. Invalid creation params, including a sales minimum below lot value × (1 + margin) and its round-up.
10. Platform exclusion and zero-credit purchases.

Plus: config management (including margin changes affecting only new auctions), mint validation, a pre-created lot vault not blocking funding, rejection of fee-on-transfer lots, and rejection of a wrong treasury.

Type-check the script with `yarn install && yarn typecheck`.

## Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 5                       # program deploy needs ~3 SOL

# Use your own program keypair (the one in target/deploy is the scaffold's).
solana-keygen new -o target/deploy/marxy-keypair.json --force
anchor keys sync                       # updates declare_id! and Anchor.toml
anchor build
anchor deploy --provider.cluster devnet

# Mock mints for devnet (the admin is the mint authority of both)
spl-token create-token --decimals 6    # mock USDC
spl-token create-token --decimals 8    # mock lot (e.g. cbBTC)
```

Then call `initialize_config(min_margin_bps, get_ready_secs)` with the admin wallet, the treasury and the mock USDC mint, from a small client using `target/idl/marxy.json`, **in the same session as the deploy**. The first caller becomes admin, so don't leave a fresh deployment uninitialized. After that, `create_auction`, and use `yarn fund-lot --mock` between sales close and battle start. Optionally publish the IDL with `anchor idl init --filepath target/idl/marxy.json`.

## Design notes and caveats

- **Initialization race:** `initialize_config` makes its signer the admin. Initialize immediately after deploying (or in the same script) so nobody else can claim the config.
- **Donations:** anyone can send tokens to a vault. Settlement sweeps the *entire* vault balance to the winner or treasury. In refund mode, a donated USDC remainder stays in the vault, which then isn't closed.
- **Admin rotation** takes effect immediately for all auctions, because instructions check `config.admin` live. A rotated-out treasury becomes a regular wallet, and the old admin can then play.
- Players can withdraw while a postponed auction is waiting for its new sales close. That can push sales back below the minimum, which then settles into refunds.
