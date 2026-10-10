// The one place that decides which stage an auction is in. Pure: give it the
// auction and the on-chain time. Used by the UI and the worker alike.
import type { AuctionView } from "./types";

export type Stage =
  /** Credits on sale, sales close ahead. */
  | "open"
  /** Postponed once: sales reopened, buyers may refund. */
  | "postponed"
  /** Sales closed below the minimum; waiting for a postpone or refunds. */
  | "short"
  /** Sales closed with the minimum met; battle starts after the get-ready period. */
  | "getReady"
  /** Bidding is open. */
  | "battle"
  /** The countdown ended (or the lot never arrived); waiting for settle. */
  | "settling"
  /** Settled with a winner. */
  | "won"
  /** Refund mode, whatever the reason. */
  | "cancelled";

export interface StageInfo {
  stage: Stage;
  battleStart: number;
  /** The time the visible countdown runs to, if any. */
  deadline: number | null;
  /** Seconds until `deadline` (never negative). */
  remaining: number | null;
  minimumMet: boolean;
}

type StageInput = Pick<
  AuctionView,
  "status" | "salesClose" | "getReadySecs" | "postponed" | "revenue" | "salesMinimum" | "funded" | "endTime"
>;

export function battleStartOf(a: Pick<AuctionView, "salesClose" | "getReadySecs">): number {
  return a.salesClose + a.getReadySecs;
}

export function getStage(a: StageInput, now: number): StageInfo {
  const battleStart = battleStartOf(a);
  const minimumMet = a.revenue >= a.salesMinimum;
  const info = (stage: Stage, deadline: number | null = null): StageInfo => ({
    stage,
    battleStart,
    deadline,
    remaining: deadline === null ? null : Math.max(0, deadline - now),
    minimumMet,
  });

  if (a.status === "refunding") return info("cancelled");
  if (a.status === "settled") return info("won");

  // Same boundaries as the program: buying needs now < sales close, funding
  // sales close <= now < battle start, bidding battle start <= now < end time.
  if (now < a.salesClose) return info(a.postponed ? "postponed" : "open", a.salesClose);
  if (!minimumMet) return info("short");
  if (now < battleStart) return info("getReady", battleStart);
  if (a.funded && now < a.endTime) return info("battle", a.endTime);
  return info("settling", a.funded ? a.endTime : battleStart);
}

export type StageGroup = "Open for sales" | "Get ready" | "Live now" | "Ended";

export const STAGE_GROUPS: StageGroup[] = ["Open for sales", "Get ready", "Live now", "Ended"];

export function groupOf(stage: Stage): StageGroup {
  switch (stage) {
    case "open":
    case "postponed":
      return "Open for sales";
    case "short":
    case "getReady":
      return "Get ready";
    case "battle":
    case "settling":
      return "Live now";
    case "won":
    case "cancelled":
      return "Ended";
  }
}
