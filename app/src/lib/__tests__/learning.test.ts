import { describe, expect, it } from "vitest";

import { applyLearning, filledEarly, type LotTuning } from "../learning";

const t = (marginBps: number, ladderShift = 0): LotTuning => ({ marginBps, ladderShift });

describe("applyLearning", () => {
  it("raises the margin 2 points when filled with half the window left, up to 50%", () => {
    expect(applyLearning(t(2_300), { outcome: "won", postponed: false, filledEarly: true })).toEqual(t(2_500));
    expect(applyLearning(t(4_900), { outcome: "won", postponed: false, filledEarly: true })).toEqual(t(5_000));
    expect(applyLearning(t(5_000), { outcome: "noBids", postponed: false, filledEarly: true })).toEqual(t(5_000));
  });

  it("lowers it 1 point when the postponement was needed, never below 23%", () => {
    expect(applyLearning(t(2_700), { outcome: "won", postponed: true, filledEarly: false })).toEqual(t(2_600));
    expect(applyLearning(t(2_300), { outcome: "won", postponed: true, filledEarly: false })).toEqual(t(2_300));
  });

  it("lowers it 2 points and moves one step cheaper after a low-sales cancellation", () => {
    expect(applyLearning(t(2_900, 0), { outcome: "lowSales", postponed: true, filledEarly: false })).toEqual(t(2_700, 1));
    expect(applyLearning(t(2_400, 1), { outcome: "lowSales", postponed: false, filledEarly: false })).toEqual(t(2_300, 2));
  });

  it("leaves pricing alone for normal fills and admin cancellations", () => {
    expect(applyLearning(t(2_500), { outcome: "won", postponed: false, filledEarly: false })).toEqual(t(2_500));
    expect(applyLearning(t(2_500), { outcome: "cancelled", postponed: false, filledEarly: true })).toEqual(t(2_500));
  });
});

describe("filledEarly", () => {
  it("is true when the minimum came with at least half the window left", () => {
    expect(filledEarly(0, 600, 300)).toBe(true);
    expect(filledEarly(0, 600, 301)).toBe(false);
    expect(filledEarly(0, 600, null)).toBe(false);
  });
});
