import { describe, expect, it } from "vitest";

import { getStage, groupOf } from "../stage";
import type { AuctionView } from "../types";

const CLOSE = 1_000_000;
const READY = 900;
const BATTLE = CLOSE + READY;

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
    salesClose: CLOSE,
    originalSalesClose: CLOSE,
    getReadySecs: READY,
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

const stage = (a: AuctionView, now: number) => getStage(a, now).stage;

describe("getStage", () => {
  it("is open before sales close, counting down to it", () => {
    const s = getStage(auction(), CLOSE - 10);
    expect(s.stage).toBe("open");
    expect(s.deadline).toBe(CLOSE);
    expect(s.remaining).toBe(10);
    expect(stage(auction({ revenue: 500n }), CLOSE - 1)).toBe("open");
  });

  it("locks exactly at sales close", () => {
    expect(stage(auction({ revenue: 123n }), CLOSE)).toBe("getReady");
    expect(stage(auction({ revenue: 122n }), CLOSE)).toBe("short");
  });

  it("shows postponed while the new sales close is ahead", () => {
    const a = auction({ postponed: true, salesClose: CLOSE + 600, originalSalesClose: CLOSE });
    expect(stage(a, CLOSE + 10)).toBe("postponed");
    expect(stage(a, CLOSE + 600)).toBe("short");
    expect(stage({ ...a, revenue: 123n }, CLOSE + 600)).toBe("getReady");
  });

  it("counts the get-ready period down to battle start", () => {
    const s = getStage(auction({ revenue: 123n, funded: true, endTime: BATTLE + 40 }), CLOSE + 100);
    expect(s.stage).toBe("getReady");
    expect(s.battleStart).toBe(BATTLE);
    expect(s.remaining).toBe(READY - 100);
    expect(stage(auction({ revenue: 123n }), BATTLE - 1)).toBe("getReady");
  });

  it("opens the battle exactly at battle start", () => {
    const a = auction({ revenue: 123n, funded: true, endTime: BATTLE + 40 });
    const s = getStage(a, BATTLE);
    expect(s.stage).toBe("battle");
    expect(s.remaining).toBe(40);
  });

  it("ends when the opening window expires without a bid", () => {
    const a = auction({ revenue: 123n, funded: true, endTime: BATTLE + 40 });
    expect(stage(a, BATTLE + 39)).toBe("battle");
    expect(stage(a, BATTLE + 40)).toBe("settling");
  });

  it("follows the bid countdown", () => {
    const a = auction({ revenue: 123n, funded: true, endTime: BATTLE + 70, bidCount: 3n });
    expect(stage(a, BATTLE + 69)).toBe("battle");
    expect(stage(a, BATTLE + 70)).toBe("settling");
  });

  it("goes to settling when the lot never arrived by battle start", () => {
    expect(stage(auction({ revenue: 123n }), BATTLE)).toBe("settling");
  });

  it("maps the final statuses", () => {
    expect(stage(auction({ status: "settled" }), 0)).toBe("won");
    expect(stage(auction({ status: "refunding" }), 0)).toBe("cancelled");
    expect(stage(auction({ status: "refunding", funded: true }), CLOSE - 1)).toBe("cancelled");
  });

  it("groups stages for the lobby", () => {
    expect(groupOf("open")).toBe("Open for sales");
    expect(groupOf("postponed")).toBe("Open for sales");
    expect(groupOf("short")).toBe("Get ready");
    expect(groupOf("getReady")).toBe("Get ready");
    expect(groupOf("battle")).toBe("Live now");
    expect(groupOf("settling")).toBe("Live now");
    expect(groupOf("won")).toBe("Ended");
    expect(groupOf("cancelled")).toBe("Ended");
  });
});
