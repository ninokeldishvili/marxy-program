// Faucet: mint test USDC to a wallet with the admin's mint authority.
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

import { CONFIG } from "../../config";
import { RateLimiter } from "../rateLimit";
import { loadAdmin } from "./keys";
import { rpcUrl } from "./paths";
import { sendIxs } from "./send";

export const FAUCET_AMOUNT = 100_000_000n; // 100 test USDC
export const FAUCET_WINDOW_MS = 10 * 60_000;

// One claim per wallet per 10 minutes. In memory: resets when the server restarts.
const globalForFaucet = globalThis as unknown as { marxyFaucetLimiter?: RateLimiter };
export const faucetLimiter = (globalForFaucet.marxyFaucetLimiter ??= new RateLimiter(FAUCET_WINDOW_MS));

export async function mintTestUsdc(wallet: PublicKey): Promise<string> {
  const admin = loadAdmin();
  const connection = new Connection(rpcUrl(), "confirmed");
  const mint = new PublicKey(CONFIG.usdcMint);
  const program = new PublicKey(CONFIG.usdcTokenProgram);
  const ata = getAssociatedTokenAddressSync(mint, wallet, true, program);
  return sendIxs(
    connection,
    [
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, wallet, mint, program),
      createMintToInstruction(mint, ata, admin.publicKey, FAUCET_AMOUNT, [], program),
    ],
    admin,
  );
}
