// Addresses written by `npm run devnet:setup` (src/config/devnet.json).
import devnet from "./devnet.json";

/** Lot tokens: native SOL (wrapped), plus the demo-era test mints for old auctions. */
export type LotTokenKey = "sol" | "testBtc" | "testSol";

/** Circle's USDC on Solana devnet (get some at https://faucet.circle.com). */
export const CIRCLE_DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** Wrapped SOL: lots in native SOL use this mint. */
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export interface LotTokenConfig {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  tokenProgram: string;
}

export interface MarxyConfig {
  cluster: string;
  programId: string;
  admin: string;
  treasury: string;
  configPda: string;
  usdcMint: string;
  usdcTokenProgram: string;
  lotMints: Partial<Record<LotTokenKey, LotTokenConfig>>;
}

export const CONFIG = devnet as MarxyConfig;

/** False until `npm run devnet:setup` has written the addresses. */
export const IS_CONFIGURED = Boolean(CONFIG.usdcMint && CONFIG.admin && CONFIG.treasury);

export function lotTokenByMint(mint: string): LotTokenConfig | undefined {
  return Object.values(CONFIG.lotMints).find((t) => t?.mint === mint);
}

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

/** Explorer links always carry ?cluster=devnet (overridable for a local validator). */
const EXPLORER_CLUSTER = process.env.NEXT_PUBLIC_EXPLORER_CLUSTER || "devnet";

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${EXPLORER_CLUSTER}`;
}
