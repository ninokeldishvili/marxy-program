// How the worker adjusts a lot type's margin and ladder step after each auction.
import { MAX_MARGIN_BPS, MIN_MARGIN_BPS } from "./pricing";

export interface LotTuning {
  marginBps: number;
  /** Steps cheaper than the default ladder choice. */
  ladderShift: number;
}

export type AuctionOutcome =
  /** Ran and settled with a winner. */
  | "won"
  /** Funded, but nobody bid in the opening window. */
  | "noBids"
  /** The minimum was met but the lot never arrived. */
  | "notFunded"
  /** Cancelled because sales stayed below the minimum. */
  | "lowSales"
  /** Cancelled by the admin. */
  | "cancelled";

export interface OutcomeFacts {
  outcome: AuctionOutcome;
  /** It took the postponement to reach the minimum. */
  postponed: boolean;
  /** The minimum was reached with at least half the sales window left. */
  filledEarly: boolean;
}

export const DEFAULT_TUNING: LotTuning = { marginBps: MIN_MARGIN_BPS, ladderShift: 0 };

const clampMargin = (bps: number) => Math.min(MAX_MARGIN_BPS, Math.max(MIN_MARGIN_BPS, bps));

export function applyLearning(t: LotTuning, f: OutcomeFacts): LotTuning {
  if (f.outcome === "lowSales") {
    // Cancelled for low sales: margin −2 points and one step cheaper.
    return { marginBps: clampMargin(t.marginBps - 200), ladderShift: t.ladderShift + 1 };
  }
  // The rules are about sales: they apply whenever the minimum was met
  // (won, no bids, not funded). An admin cancellation says nothing about pricing.
  if (f.outcome === "cancelled") return t;
  if (f.postponed) return { ...t, marginBps: clampMargin(t.marginBps - 100) };
  if (f.filledEarly) return { ...t, marginBps: clampMargin(t.marginBps + 200) };
  return t;
}

/** Filled with at least half the sales window left. */
export function filledEarly(createdAt: number, salesClose: number, filledAt: number | null): boolean {
  if (filledAt === null) return false;
  return filledAt <= createdAt + (salesClose - createdAt) / 2;
}
