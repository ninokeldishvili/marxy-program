// Addresses written by `npm run devnet:setup` (src/config/devnet.json).
import devnet from "./devnet.json";

export type LotTokenKey = "testBtc" | "testSol";

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
