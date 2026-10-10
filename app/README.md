# Marxy demo app

A Next.js app plus a backend worker for playing Marxy auctions on **Solana devnet** with Phantom. The rules live in the Anchor program (`../programs/marxy`, see `../README.md`). This app and the worker only drive it.

```
CREATE ─▶ SELL ─▶ LOCK ─▶ GET READY ─▶ BATTLE ─▶ WIN ─▶ CLOSE OUT
worker    players  chain   worker funds  players   worker   players
lists     buy      clock   the lot       bid       settles  withdraw
```

| Piece | Where | What it does |
|---|---|---|
| Web app | `src/app/` | Lobby, auction screen, My auctions, admin page, faucet route |
| Shared logic | `src/lib/` | `getStage`, pricing, learning, error mapping, instruction builders. Used by the app, the worker and the scripts |
| Worker | `worker/` | The platform's automation: lists lots, funds, postpones, settles, learns, runs the demo bots |
| Scripts | `scripts/` | `devnet-setup.ts` (one-time), `smoke.ts` (end-to-end check), `sync-idl.mjs` |

## Prerequisites

- **Node.js** 20.9 or newer (tested with 24), plus npm.
- **Solana CLI** and **Anchor CLI 1.1.2**, to build and deploy the program.
- **Phantom** with devnet on: Settings → Developer Settings → **Testnet Mode** on → **Solana Devnet**.
- **Devnet SOL** from https://faucet.solana.com or `solana airdrop 2 --url devnet`:
  - The admin wallet needs about 2 SOL: program deploy (around 3 SOL, once), auction rent and bot funding.
  - Each player needs about 0.01 SOL for fees and account rent.

## 1. Deploy the program (with demo timers)

The real get-ready period is 15 minutes. For demos, build with the `demo-timers` feature, which makes it **2 minutes**. Run this from the repo root:

```bash
anchor build -- --features demo-timers
anchor deploy --provider.cluster devnet
```

> The default build (`anchor build`, 15 minutes) is the verified production binary. A `demo-timers` build has a different hash. Redeploy the default build when you're done demoing if you want the verified program back.

## 2. Copy the IDL into the app

```bash
cd app
npm install
npm run sync-idl
```

This copies `../target/idl/marxy.json` and `../target/types/marxy.ts` into `src/idl/`. The app reads the program ID and the timers (`GET_READY_SECS`) from that IDL, so **sync after every build**. The script prints whether it copied a demo build.

## 3. One-time devnet setup

```bash
cp .env.example .env.local      # set ADMIN_KEYPAIR_PATH and ADMIN_API_SECRET
npm run devnet:setup
```

The script:

- loads the admin keypair, which must be the wallet that will own the config;
- creates a treasury keypair and the mock mints (**USDC** 6 decimals, **Test BTC** 8, **Test SOL** 9) in `.keys/`;
- calls `initialize_config` with a 2,300 bps (23%) minimum margin;
- writes every address to `src/config/devnet.json`;
- prints the env vars for `.env.local`.

It's idempotent: a second run changes nothing. If the config already exists with other values, it stops; `npm run devnet:setup -- --update-config` aligns them.

`.keys/` holds the treasury, mint and bot keypairs. It and `.env.local` are gitignored. Back up `.keys/` if you want to keep the same mints.

## 4. Run the app and the worker side by side

```bash
npm run dev       # terminal 1: http://localhost:3000
npm run worker    # terminal 2: the platform's automation
```

The worker ticks every 5 s. For each lot type in `worker/catalog.json` it keeps the configured number of live auctions running.

**Pricing:**
- **Lot cost:** the Jupiter price of the real asset (mainnet mint) × amount, rounded up to the next dollar. If Jupiter fails, the catalog's fallback price.
- **Sales minimum:** cost × (1 + margin).
- **Credit price:** the cheapest step on the ladder that keeps the minimum within 1,000 credits.
- **Cap:** floor(10% × cost ÷ price).

**At sales close:**
- **Minimum met:** the worker mints the lot from the test mint and calls `fund_lot` straight away.
- **At least 70% of the minimum sold, not yet postponed:** `postpone` by one sales length.
- **Otherwise:** settle into refunds once the program allows it. If the auction wasn't postponed, that's 1 hour after the original sales close (the program's postpone grace period).

**Afterwards:**
- It settles as soon as the countdown ends.
- It updates the lot type's margin and ladder step in `worker/state.json`: +2 points when filled early, −1 after a needed postponement, −2 and one step cheaper after a low-sales cancellation, always staying between 23% and 50%.

Every action is logged with its transaction signature, both to the console and on the admin page.

## Test funds

- **USDC:** the **Get 100 test USDC** button in the header calls `POST /api/faucet`, which mints with the admin's mint authority on the server. It allows one claim per wallet per 10 minutes, tracked in memory.
- **SOL:** the header shows your SOL balance, warns below 0.01 SOL and links to https://faucet.solana.com.

## Demo bots

With the 10% cap, an auction needs at least 13 full buyers. With `DEMO_BOTS=true`, the worker manages 20 bot wallets in `.keys/bots/`:

- **Funding:** it tops them up with SOL from the admin (`BOT_SOL`, default 0.03) and with test USDC.
- **Buying:** one minute before sales close, if the minimum isn't met, bots buy just enough credits, each within its cap.
- **Bidding:** during the battle, bots bid in the last seconds of the countdown, a few times per auction. They stop for good once a human leads with more than 10 s left, so humans can win.
- **Close-out:** after an auction ends, bots withdraw, getting their refund or rent back.
- **Labels:** the UI tags bot wallets as `bot`.

## Admin page

`/admin` is visible only when the connected wallet is the admin.

1. Enter `ADMIN_API_SECRET`.
2. It shows the worker's heartbeat, each lot type's margin and ladder step, the auctions with their stage and outcome, and the worker log.
3. **Create auction now** queues a command for the worker, which picks it up within 5 s. **Settle now** settles immediately from the server; the program refuses if it isn't time yet.

## Tests

```bash
npm test          # Vitest: pricing, getStage boundaries, learning, error mapping, faucet limiter
npm run lint
npm run build
npm run smoke     # devnet: one full auction with bots, then checks final balances
```

`npm run smoke` needs a `demo-timers` deployment and a completed setup. It runs about four minutes: create, bots buy to the minimum, fund, three bids, settle, everyone withdraws. It then checks:

- the winner holds the lot;
- the treasury received exactly the revenue;
- every participant got exactly their account rent back, minus the fee, and no USDC.

## 5-minute demo script for judges

Before you start:
- **Programs:** run `npm run worker` with `DEMO_BOTS=true` and `DEMO_SALES_MINUTES=3`, plus `npm run dev`.
- **Your wallet:** a fresh Phantom wallet on devnet with about 0.05 SOL.

1. **Lobby (0:00).** Point out the stages: Open for sales, Get ready, Live now, Ended. Each card shows the credit price, your cap, sales progress against the minimum, and a countdown.
2. **Faucet (0:30).** Connect Phantom (listed first), then click **Get 100 test USDC**. The balance updates in the header.
3. **Buy (1:00).** Open an auction in *Open for sales* and buy a few credits. The total cost updates as you type, the cap is enforced, and the toast links to the explorer. Mention the 23% margin built into the sales minimum.
4. **Lock (≈1:30).** One minute before close, the bots fill the minimum and the progress bar hits 100%. At sales close the page switches to *"Credit purchases are locked. Auction is ready to start in 2 mins. Get ready!"* (The platform buys the lot during this period, but the UI never says so.)
5. **Battle (≈3:30).** The countdown starts with the 40 s opening window, and bots trade bids in its last seconds; each bid resets it to 25 s. Watch the live feed for a round or two, then bid. You become the last bidder ("You") and your Bid button disables. Because you lead with more than 10 s left, the bots back off.
6. **Win (≈4:30).** At zero the page shows "Settling…", then **You won 0.5 Test SOL!** with explorer links. Phantom shows the Test SOL.
7. **Close out (≈5:00).** Go to **My auctions** and click **Close out** to get your account rent back (unused credits burn). Optionally show `/admin` from the admin wallet: the worker log, the learned margins and **Create auction now**.

## Troubleshooting

- **"Is Phantom on devnet?"** The app sends transactions through its own devnet RPC after Phantom signs them. If a transaction fails because of the network, the toast tells you how to switch Phantom to devnet.
- **Countdowns look off.** They run on the chain clock: the offset comes from `getBlockTime` and is refreshed every 30 s.
- **Rate limits on api.devnet.solana.com.** Set `NEXT_PUBLIC_RPC_URL` and `RPC_URL` to a dedicated devnet RPC.
- **The worker says "ADMIN_KEYPAIR_PATH is X, but the program admin is Y".** Use the keypair that ran `devnet:setup`.
- **Low-sales cancellations take an hour.** That's the program's postpone grace period (`POSTPONE_GRACE_SECONDS`). Refunds can only be settled after it.
