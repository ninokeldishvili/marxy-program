// The worker's lot catalog (worker/catalog.json).
import type { LotTokenKey } from "../config";

export interface LotType {
  key: string;
  name: string;
  /** Which test mint the lot is paid out in. */
  token: LotTokenKey;
  /** Human amount, e.g. "0.001". */
  amount: string;
  /** Image path under /public. */
  image: string;
  /** How many live auctions of this type to keep. */
  liveAuctions: number;
  /** Sales length in minutes (defaults to DEMO_SALES_MINUTES). */
  salesMinutes?: number;
  /** Mainnet mint of the real asset, for the Jupiter price. */
  priceMint: string;
  /** USD price used when Jupiter is unavailable. */
  fallbackUsdPrice: number;
}

/** "0.001" with 8 decimals -> 100000n. */
export function parseAmount(amount: string, decimals: number): bigint {
  const [whole, fraction = ""] = amount.trim().split(".");
  if (!/^\d+$/.test(whole || "0") || !/^\d*$/.test(fraction) || fraction.length > decimals) {
    throw new Error(`bad amount ${amount} for ${decimals} decimals`);
  }
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}
