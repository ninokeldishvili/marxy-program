import { PublicKey } from "@solana/web3.js";

import { IS_CONFIGURED } from "@marxy/shared/config";
import { faucetLimiter, mintTestUsdc } from "@marxy/shared/node/faucet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { wallet } -> mints 100 test USDC to the wallet's ATA (once per 10 min per wallet). */
export async function POST(req: Request) {
  if (!IS_CONFIGURED) return Response.json({ error: "run npm run devnet:setup first" }, { status: 503 });
  let wallet: PublicKey;
  try {
    const body = (await req.json()) as { wallet?: string };
    wallet = new PublicKey(body.wallet ?? "");
  } catch {
    return Response.json({ error: "send { wallet: <base58 address> }" }, { status: 400 });
  }
  const key = wallet.toBase58();
  const limit = faucetLimiter.hit(key);
  if (!limit.ok) {
    const minutes = Math.ceil(limit.retryAfterMs / 60_000);
    return Response.json({ error: `One claim per 10 minutes. Try again in ${minutes} min.` }, { status: 429 });
  }
  try {
    const signature = await mintTestUsdc(wallet);
    return Response.json({ signature });
  } catch (e) {
    faucetLimiter.undo(key);
    console.error("faucet", e);
    return Response.json({ error: "The faucet couldn't mint right now. Try again shortly." }, { status: 502 });
  }
}
