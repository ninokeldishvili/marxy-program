import { describe, expect, it } from "vitest";

import type { AuctionView } from "../types";
import { auctionFromJson, auctionToJson } from "../wire";

describe("wire", () => {
  it("round-trips an auction through JSON", () => {
    const a: AuctionView = {
      address: "A", id: 42n, lotMint: "L", lotAmount: 2_000n, lotValue: 2_000_000n, usdcMint: "U",
      creditPrice: 10_000n, maxCreditsPerPlayer: 20n, salesMinimum: 2_460_000n, salesClose: 1_000,
      originalSalesClose: 1_000, getReadySecs: 120, openingWindow: 40, countdown: 25, endTime: 0,
      funded: false, fundedTime: 0, totalCreditsSold: 7n, revenue: 70_000n, participantCount: 1,
      bidCount: 0n, lastBidder: "11111111111111111111111111111111", status: "active", postponed: false,
    };
    const back = auctionFromJson(JSON.parse(JSON.stringify(auctionToJson(a))));
    expect(back).toEqual(a);
  });
});
