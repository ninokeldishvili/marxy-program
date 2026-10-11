# Marxy frontend

The Next.js app players use on **Solana devnet** with Phantom: landing page, lobby, auction screen, My auctions and the admin page. The rules live in the program (`../program`); the platform's automation is the worker (`../worker`); shared logic is `@marxy/shared` (`../packages/shared`).

## Run locally

From the repo root:

```bash
npm install
cp worker/.env.example worker/.env.local     # then fill it in (see ../worker/README.md)
npm run worker                                # terminal 1: the worker and its admin API on :8787
npm run dev                                   # terminal 2: http://localhost:3000
```

`frontend/.env.local`:

| Variable | What |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | Devnet RPC the browser uses. Public in the bundle: use a key restricted to your domain. |
| `RPC_URL` | Optional server-only RPC for `/api/auctions` (defaults to `NEXT_PUBLIC_RPC_URL`). |
| `NEXT_PUBLIC_EXPLORER_CLUSTER` | `devnet` (explorer links). |
| `NEXT_PUBLIC_WORKER_URL` | The worker's admin API, e.g. `http://localhost:8787`. Only the admin page uses it. |

The frontend holds no keys. Its only server code is `GET /api/auctions`: the auction list, read from the RPC at most every 3 s and shared by every visitor (`Cache-Control: s-maxage=3` lets Vercel's CDN share it too).

## Deploy on Vercel

1. Import the repo, set **Root Directory** to `frontend`. Vercel installs the npm workspaces from the repo root.
2. Add the variables above. Set `NEXT_PUBLIC_WORKER_URL` to the worker's public URL.
3. Add the Vercel domain to the worker's `ALLOWED_ORIGIN`, so the admin page can call it.

## Tokens

- **Credits** are paid in Circle's devnet USDC. Players get it at https://faucet.circle.com (choose Solana Devnet). The header links there.
- **Fees** are paid in devnet SOL: https://faucet.solana.com. The header warns below 0.01 SOL.
- **Lots** are paid out in SOL as wrapped SOL (an SPL token). The winner's banner and My auctions show **Unwrap to SOL** while the wallet holds any.

Devnet only: the tokens have no real value.

## How it stays live

- **Lobby:** polls `/api/auctions` every 5 s.
- **Auction page:** websocket subscriptions to the auction and your participant account, plus a 15 s fallback poll and re-reads right after your own transactions.
- **Balances:** every 30 s and after your own transactions.
- **Background tabs:** polling pauses.
- **Stale RPC nodes:** load-balanced RPCs sometimes serve older copies of accounts. Auctions and your credits never go backwards or disappear (`@marxy/shared/freshness`).

## Admin page

`/admin` is visible only to the config admin wallet. Enter the worker's `ADMIN_API_SECRET`. It shows the worker's heartbeat, each lot type's learned margin and ladder step, its auctions and log, plus **Create auction now** and **Settle now** (both run on the worker).

## Checks

```bash
npm run typecheck && npm run lint    # repo root: every workspace
npm run build -w frontend
```

## Troubleshooting

- **"Is Phantom on devnet?"** Phantom → Settings → Developer Settings → Testnet Mode on → Solana Devnet. The app sends transactions through its own devnet RPC after Phantom signs them.
- **Countdowns look off.** They run on the chain clock (offset from `getBlockTime`, refreshed every 30 s).
- **Admin page says it can't reach the worker.** Check `NEXT_PUBLIC_WORKER_URL`, that the worker runs, and that its `ALLOWED_ORIGIN` includes this site's origin.
