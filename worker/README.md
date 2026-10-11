# Marxy worker

The platform's automation: a long-running Node process that signs with the program admin key. Every 5 s it:

- keeps `openAuctions` auctions open for sales per lot type in `catalog.json` (players always have one to join);
- at sales close, **funds the lot** if the minimum is met: it wraps the admin's SOL and calls `fund_lot`. Otherwise it **postpones** once (at least 70% sold) or **settles into refunds** once the program allows it (1 hour after the original close, unless postponed);
- **settles** as soon as a countdown ends;
- **learns** per lot type: +2 margin points when filled early, −1 after a needed postponement, −2 and one ladder step cheaper after a low-sales cancellation (always 23–50%).

It also serves the admin API that the frontend's `/admin` page calls.

## Pricing

- **Lot cost:** the Jupiter SOL price × amount, rounded up to the next dollar (the catalog's `fallbackUsdPrice` if Jupiter fails).
- **Sales minimum:** cost × (1 + margin).
- **Credit price:** the cheapest ladder step that keeps the minimum within 1,000 credits.
- **Cap:** floor(25% × cost ÷ credit price), so a full auction needs at least 5 players.

The admin wallet pays for every funded lot in real devnet SOL, while revenue arrives in USDC. Keep lots small and keep the admin topped up: the log warns below `LOW_SOL` (default 1 SOL).

## Setup

```bash
cp .env.example .env.local         # fill in; see the comments
npm run devnet:setup               # repo root: checks the program and USDC mint, initializes or aligns the config
npm run worker                     # repo root (or `npm start` here)
```

`devnet:setup` is idempotent. If the on-chain config differs (USDC mint, treasury, margin, get-ready period), it stops; `npm run devnet:setup -- --update-config` aligns it. It writes `packages/shared/src/config/devnet.json`, which both apps read.

Files here (all gitignored): `.env.local`, `.keys/` (the treasury keypair, used by `devnet:setup`; back it up), `state.json` (learning, auction records, log).

## Admin API (`api.ts`)

| Route | Auth | What |
|---|---|---|
| `GET /health` | none | `{ ok, updatedAt }` for uptime checks |
| `GET /state` | secret | the worker state and catalog (the admin page) |
| `POST /create` `{ lotType }` | secret | list a new auction on the next tick |
| `POST /settle` `{ auctionId }` | secret | settle now (the program refuses if it isn't time) |

The secret is the `x-admin-secret` header, compared against `ADMIN_API_SECRET`. Browsers may only call it from `ALLOWED_ORIGIN`.

## Deploy on Railway

1. New project → Deploy from GitHub repo. In the service settings set **Root Directory** to `/` (the workspaces need the root), **Build Command** `npm ci`, **Start Command** `npm run worker`.
2. Variables:
   - `RPC_URL`: a private devnet RPC.
   - `ADMIN_KEYPAIR`: the admin keypair's JSON byte array (the contents of the keypair file).
   - `ADMIN_API_SECRET`: `openssl rand -hex 24`.
   - `ALLOWED_ORIGIN`: the Vercel URL(s), comma-separated.
   - `GET_READY_SECS=300`, `SALES_MINUTES=30`, optionally `JUP_API_KEY`.
   - `MARXY_STATE_PATH=/data/state.json`.
3. Add a **Volume** mounted at `/data`, so the learned margins, auction records and log survive redeploys. (The worker reads the treasury from the on-chain config; only `devnet:setup`, run locally, needs `.keys/`.)
4. Settings → Networking → **Generate Domain**: that URL is the frontend's `NEXT_PUBLIC_WORKER_URL`. Railway sets `PORT`.
5. Optional: health check path `/health`.

Run exactly **one** instance: two workers would race to create and fund the same auctions.
