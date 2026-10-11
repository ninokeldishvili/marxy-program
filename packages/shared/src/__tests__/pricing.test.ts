import { describe, expect, it } from "vitest";

import {
  capFor,
  isTinyLot,
  lotCostFromPrice,
  MIN_MARGIN_BPS,
  priceLot,
  salesMinimumFor,
  USDC_UNIT,
} from "../pricing";

const usd = (n: number) => BigInt(Math.round(n * 100)) * 10_000n;

describe("lotCostFromPrice", () => {
  it("rounds the USD cost up to the next dollar", () => {
    // 0.001 BTC at $82,869.97 = $82.87 -> $83
    expect(lotCostFromPrice(82_869.97, 100_000n, 8)).toBe(83n * USDC_UNIT);
    // 0.5 SOL at $110.25 = $55.125 -> $56
    expect(lotCostFromPrice(110.25, 500_000_000n, 9)).toBe(56n * USDC_UNIT);
  });

  it("keeps whole-dollar costs and ignores float noise", () => {
    expect(lotCostFromPrice(100, 1_000_000_000n, 9)).toBe(100n * USDC_UNIT);
    expect(lotCostFromPrice(0.1 + 0.2, 10_000_000_000n, 9)).toBe(3n * USDC_UNIT);
  });

  it("never prices a lot below $1", () => {
    expect(lotCostFromPrice(0.0001, 1n, 0)).toBe(USDC_UNIT);
  });

  it("rejects missing prices", () => {
    expect(() => lotCostFromPrice(0, 1n, 0)).toThrow();
    expect(() => lotCostFromPrice(Number.NaN, 1n, 0)).toThrow();
  });
});

describe("salesMinimumFor", () => {
  it("is cost x (1 + margin), rounded up like the program", () => {
    expect(salesMinimumFor(usd(100), 2_300)).toBe(usd(123));
    expect(salesMinimumFor(100_000_001n, 2_300)).toBe(123_000_002n);
  });

  it("never goes below the 23% margin floor", () => {
    expect(salesMinimumFor(usd(100), 0)).toBe(usd(123));
    expect(salesMinimumFor(usd(100), 1_000)).toBe(usd(123));
  });
});

describe("priceLot", () => {
  it("picks the cheapest regular step with at most 1,000 target credits", () => {
    // $10,000 lot -> $12,300 minimum: $10 needs 1,230 credits, $25 needs 492.
    const p = priceLot({ lotValue: usd(10_000), marginBps: 2_300 });
    expect(p.creditPrice).toBe(usd(25));
    expect(p.targetCredits).toBe(492n);
    expect(p.maxCreditsPerPlayer).toBe(100n); // floor(25% x 10,000 / 25)
    expect(p.salesMinimum).toBe(usd(12_300));
  });

  it("uses the tiny steps for small demo lots", () => {
    // $100 lot -> $123 minimum: $0.10 needs 1,230 credits, $0.25 needs 492.
    expect(isTinyLot(usd(123))).toBe(true);
    const p = priceLot({ lotValue: usd(100), marginBps: 2_300 });
    expect(p.creditPrice).toBe(usd(0.25));
    expect(p.targetCredits).toBe(492n);
    expect(p.maxCreditsPerPlayer).toBe(100n); // floor(25% x 100 / 0.25)
  });

  it("does not offer tiny steps to larger lots", () => {
    expect(isTinyLot(usd(500))).toBe(false);
    // $1,000 lot -> $1,230 minimum: $0.50 would need 2,460, $1 needs 1,230, $2 needs 615.
    expect(priceLot({ lotValue: usd(1_000), marginBps: 2_300 }).creditPrice).toBe(usd(2));
  });

  it("moves cheaper by the learned ladder shift, never below the first step", () => {
    expect(priceLot({ lotValue: usd(100), marginBps: 2_300, ladderShift: 1 }).creditPrice).toBe(usd(0.1));
    expect(priceLot({ lotValue: usd(100), marginBps: 2_300, ladderShift: 99 }).creditPrice).toBe(usd(0.01));
    expect(priceLot({ lotValue: usd(10_000), marginBps: 2_300, ladderShift: 2 }).creditPrice).toBe(usd(5));
  });

  it("falls back to the top step for huge lots", () => {
    const p = priceLot({ lotValue: usd(1_000_000), marginBps: 2_300 });
    expect(p.creditPrice).toBe(usd(250));
    expect(p.targetCredits).toBe(4_920n);
  });

  it("applies the margin floor and the 50% ceiling", () => {
    expect(priceLot({ lotValue: usd(100), marginBps: 500 }).marginBps).toBe(MIN_MARGIN_BPS);
    expect(priceLot({ lotValue: usd(100), marginBps: 9_000 }).marginBps).toBe(5_000);
    expect(priceLot({ lotValue: usd(100), marginBps: 2_700 }).salesMinimum).toBe(usd(127));
  });

  it("matches the on-chain cap formula", () => {
    expect(capFor(usd(100), usd(3))).toBe(8n); // floor(25 / 3)
    expect(capFor(usd(100), usd(25))).toBe(1n);
    expect(capFor(usd(100), usd(25) + 1n)).toBe(0n);
  });
});
