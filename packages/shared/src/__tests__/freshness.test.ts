import { describe, expect, it } from "vitest";

import { fresherAuction, fresherParticipant, isStale, markParticipantClosed, mergeAuctions } from "../freshness";
import type { AuctionView, ParticipantView } from "../types";

function auction(over: Partial<AuctionView> = {}): AuctionView {
  return {
    address: "A",
    id: 1n,
    lotMint: "L",
    lotAmount: 1n,
    lotValue: 100n,
    usdcMint: "U",
    creditPrice: 1n,
    maxCreditsPerPlayer: 10n,
    salesMinimum: 123n,
    salesClose: 1_000,
    originalSalesClose: 1_000,
    getReadySecs: 120,
    openingWindow: 40,
    countdown: 25,
    endTime: 0,
    funded: false,
    fundedTime: 0,
    totalCreditsSold: 0n,
    revenue: 0n,
    participantCount: 0,
    bidCount: 0n,
    lastBidder: "11111111111111111111111111111111",
    status: "active",
    postponed: false,
    ...over,
  };
}

describe("freshness", () => {
  it("spots older copies of an auction", () => {
    expect(isStale(auction(), auction({ totalCreditsSold: 5n }))).toBe(true);
    expect(isStale(auction({ funded: true, bidCount: 3n }), auction({ funded: true, bidCount: 4n }))).toBe(true);
    expect(isStale(auction({ funded: true, bidCount: 9n }), auction({ funded: true, bidCount: 9n, status: "settled" }))).toBe(true);
    expect(isStale(auction(), auction())).toBe(false);
    expect(isStale(auction({ bidCount: 4n }), auction({ bidCount: 3n }))).toBe(false);
    // Refunds lower credits sold after the end: the ended copy still wins.
    expect(isStale(auction({ totalCreditsSold: 689n }), auction({ status: "refunding" }))).toBe(true);
    expect(isStale(auction({ status: "refunding" }), auction({ totalCreditsSold: 689n }))).toBe(false);
  });

  it("never rolls an auction back", () => {
    const settled = auction({ funded: true, bidCount: 9n, status: "settled" });
    expect(fresherAuction(settled, auction())).toBe(settled);
    const newer = auction({ totalCreditsSold: 2n });
    expect(fresherAuction(auction(), newer)).toBe(newer);
    expect(fresherAuction(undefined, newer)).toBe(newer);
  });

  it("keeps auctions a lagging node doesn't return", () => {
    const a3 = auction({ address: "A3", id: 3n, status: "settled" });
    const a7 = auction({ address: "A7", id: 7n, totalCreditsSold: 4n });
    const prev = [a7, a3];
    const stale = [auction({ address: "A3", id: 3n })]; // old copy, and #7 missing
    expect(mergeAuctions(prev, stale)).toEqual([a7, a3]);
    const a9 = auction({ address: "A9", id: 9n });
    expect(mergeAuctions(prev, [a9]).map((a) => a.id)).toEqual([9n, 7n, 3n]);
    expect(mergeAuctions(null, [a3, a9]).map((a) => a.id)).toEqual([9n, 3n]);
  });

  it("never rolls a participant back", () => {
    const p = (bought: bigint, left: bigint, address = "P"): ParticipantView =>
      ({ address, auction: "A", player: "W", creditsBought: bought, creditsLeft: left });
    const full = p(20n, 20n);
    expect(fresherParticipant(full, null, "P")).toBe(full); // missing on a lagging node
    expect(fresherParticipant(full, p(5n, 5n), "P")).toBe(full); // older copy
    const afterBid = p(20n, 19n);
    expect(fresherParticipant(full, afterBid, "P")).toBe(afterBid);
    expect(fresherParticipant(afterBid, full, "P")).toBe(afterBid);
    expect(fresherParticipant(null, full, "P")).toBe(full);
    // Another wallet's account: the previous copy doesn't apply.
    expect(fresherParticipant(full, null, "Q")).toBeNull();
    markParticipantClosed("P");
    expect(fresherParticipant(full, full, "P")).toBeNull();
  });
});
