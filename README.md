# Marxy

A Solana auction game: players buy bid credits in USDC before sales close, then battle with last-bid countdowns for a crypto lot. Runs on devnet.

| Folder | What | Runs on |
|---|---|---|
| [`program/`](program/README.md) | Anchor program (the rules) and its LiteSVM tests | Solana |
| [`packages/shared/`](packages/shared) | IDL, instruction builders, pricing, stages, freshness rules, shared by both apps | (library) |
| [`frontend/`](frontend/README.md) | Next.js app with Phantom: landing, lobby, auctions, admin page | Vercel |
| [`worker/`](worker) | The platform's automation: lists lots, funds, postpones, settles | a long-running Node host |

npm workspaces tie the JavaScript parts together. From the repo root:

```bash
npm install                 # every workspace
npm run dev                 # frontend on http://localhost:3000
npm run worker              # the worker
npm test                    # shared logic tests
npm run typecheck && npm run lint
npm run devnet:setup        # one-time config setup (worker/.env.local)
npm run sync-idl            # after `anchor build` in program/: copy the IDL into packages/shared
```

Program: `cd program && anchor build && cargo test`. Program ID `eFXAZBczq33MQPwveUxMPP9SfNw5RAeVpdeNtZYtcCF` on devnet.
