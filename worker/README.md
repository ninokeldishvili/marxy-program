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

Deploy the worker **before** the frontend: the frontend needs its URL. Railway builds from GitHub, so push the branch first.

1. **Account.** Sign up at https://railway.com with GitHub. An always-on service with a volume needs the **Hobby** plan (about $5/month, usage included).
2. **Service.** New Project → *Deploy from GitHub repo* → pick the repo (allow Railway's GitHub app to see it) and the branch.
3. **Settings** (service → Settings): leave **Root Directory** empty (repo root: the npm workspaces need it). The rest comes from `railway.json` at the repo root: start command `npm run worker`, health check `/health`, one replica, and watch paths so frontend-only commits don't restart the worker. Node is pinned in the root `package.json` (`engines`).
4. **Volume.** Right-click the service on the canvas → *Attach Volume*, mount path `/data`. It keeps the learned margins, auction records and log across redeploys.
5. **Variables** (service → Variables):

   | Variable | Value |
   |---|---|
   | `RPC_URL` | your private devnet RPC (Alchemy, QuickNode, …) |
   | `ADMIN_KEYPAIR` | the admin keypair's JSON array: the whole content of `~/.config/solana/id.json` |
   | `ADMIN_API_SECRET` | `openssl rand -hex 24`; keep it, the admin page asks for it |
   | `ALLOWED_ORIGIN` | `http://localhost:3000` for now; the Vercel URL once it exists |
   | `GET_READY_SECS` | `300` |
   | `SALES_MINUTES` | `30` |
   | `LOW_SOL` | `1` |
   | `MARXY_STATE_PATH` | `/data/state.json` |
   | `JUP_API_KEY` | optional |

6. **Port and public URL.** Add the variable `PORT=8787`, then Settings → Networking → *Generate Domain* and enter port `8787` (the dialog needs the port the app listens on). That `https://….up.railway.app` is the frontend's `NEXT_PUBLIC_WORKER_URL`.
7. **Check:** `curl https://<worker>/health` returns `{"ok":true,…}`. The deploy logs show `admin API on :…` and, on a fresh volume, `adopted from the chain` for every open auction.

**Run exactly one worker.** Stop the local one before Railway's starts: two workers race to create and fund the same auctions. A fresh or lost state file is fine: the worker adopts every active on-chain auction it doesn't know.

The admin key is also the program's upgrade authority. Moving the upgrade authority to an offline key keeps upgrade power off the hosted machine.
