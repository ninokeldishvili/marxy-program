// Lot pricing shared by the worker, the admin API and the tests. All amounts
// are USDC base units (6 decimals) as bigint.
import { BPS_DENOMINATOR, MAX_PLAYER_SHARE_BPS } from "./idl";

export const USDC_DECIMALS = 6;
export const USDC_UNIT = 1_000_000n;

/** The platform's minimum margin (matches `min_margin_bps` in the config): 23%. */
export const MIN_MARGIN_BPS = 2_300;
/** Learning never raises the margin above 50%. */
export const MAX_MARGIN_BPS = 5_000;
/** The credit price is chosen so the sales minimum needs at most this many credits. */
export const MAX_TARGET_CREDITS = 1_000n;

const cents = (c: number) => BigInt(c) * 10_000n;
/** Regular credit-price ladder: $0.50 … $250. */
export const LADDER = [50, 100, 200, 500, 1_000, 2_500, 5_000, 10_000, 25_000].map(cents);
/** Extra steps below $0.50 for tiny demo lots: $0.01, $0.05, $0.10, $0.25. */
export const TINY_LADDER = [1, 5, 10, 25].map(cents);

export const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** USD price × amount, rounded up to the next whole dollar, in USDC base units. */
export function lotCostFromPrice(usdPrice: number, lotAmount: bigint, decimals: number): bigint {
  if (!(usdPrice > 0)) throw new Error("price must be positive");
  const amount = Number(lotAmount) / 10 ** decimals;
  // Subtract a hair before ceil so float noise (e.g. 100.00000000001) doesn't add a dollar.
  const dollars = Math.ceil(usdPrice * amount - 1e-9);
  return BigInt(Math.max(1, dollars)) * USDC_UNIT;
}

/** ceil(cost × (1 + margin)), exactly as the program checks it. */
export function salesMinimumFor(lotValue: bigint, marginBps: number): bigint {
  const bps = BigInt(Math.max(marginBps, MIN_MARGIN_BPS));
  return ceilDiv(lotValue * (BigInt(BPS_DENOMINATOR) + bps), BigInt(BPS_DENOMINATOR));
}

/** floor(10% × cost ÷ price), exactly as the program stores it. */
export function capFor(lotValue: bigint, creditPrice: bigint): bigint {
  return (lotValue * BigInt(MAX_PLAYER_SHARE_BPS)) / BigInt(BPS_DENOMINATOR) / creditPrice;
}

/** Tiny lots: even $0.50 credits would need fewer than 1,000 to reach the minimum. */
export function isTinyLot(salesMinimum: bigint): boolean {
  return salesMinimum < LADDER[0] * MAX_TARGET_CREDITS;
}

export function ladderFor(salesMinimum: bigint): bigint[] {
  return isTinyLot(salesMinimum) ? [...TINY_LADDER, ...LADDER] : LADDER;
}

export interface PricingInput {
  lotValue: bigint;
  marginBps: number;
  /** Steps cheaper than the default choice (learned after low-sales cancellations). */
  ladderShift?: number;
}

export interface Pricing {
  lotValue: bigint;
  marginBps: number;
  salesMinimum: bigint;
  creditPrice: bigint;
  targetCredits: bigint;
  maxCreditsPerPlayer: bigint;
}

/**
 * The cheapest ladder step that keeps target credits (sales minimum ÷ price,
 * rounded up) at 1,000 or fewer, then `ladderShift` steps cheaper. Steps whose
 * per-player cap would be 0 are never chosen (the program rejects them).
 */
export function priceLot({ lotValue, marginBps, ladderShift = 0 }: PricingInput): Pricing {
  if (lotValue <= 0n) throw new Error("lot value must be positive");
  const margin = Math.min(Math.max(marginBps, MIN_MARGIN_BPS), MAX_MARGIN_BPS);
  const salesMinimum = salesMinimumFor(lotValue, margin);
  const ladder = ladderFor(salesMinimum);

  let index = ladder.findIndex((p) => ceilDiv(salesMinimum, p) <= MAX_TARGET_CREDITS);
  if (index === -1) index = ladder.length - 1;
  index = Math.max(0, index - Math.max(0, ladderShift));
  // Never pick a price where one credit exceeds the 10% cap.
  while (index > 0 && capFor(lotValue, ladder[index]) < 1n) index -= 1;
  const creditPrice = ladder[index];
  const maxCreditsPerPlayer = capFor(lotValue, creditPrice);
  if (maxCreditsPerPlayer < 1n) throw new Error("lot too cheap for the smallest credit price");

  return {
    lotValue,
    marginBps: margin,
    salesMinimum,
    creditPrice,
    targetCredits: ceilDiv(salesMinimum, creditPrice),
    maxCreditsPerPlayer,
  };
}
