import { describe, expect, it } from "vitest";

import { RateLimiter } from "../rateLimit";

describe("RateLimiter", () => {
  const TEN_MIN = 10 * 60_000;

  it("allows one hit per key per window", () => {
    const rl = new RateLimiter(TEN_MIN);
    expect(rl.hit("w1", 0)).toEqual({ ok: true });
    expect(rl.hit("w1", 1_000)).toEqual({ ok: false, retryAfterMs: TEN_MIN - 1_000 });
    expect(rl.hit("w2", 1_000)).toEqual({ ok: true });
    expect(rl.hit("w1", TEN_MIN - 1)).toMatchObject({ ok: false });
    expect(rl.hit("w1", TEN_MIN)).toEqual({ ok: true });
  });

  it("lets a key retry after undo", () => {
    const rl = new RateLimiter(TEN_MIN);
    rl.hit("w1", 0);
    rl.undo("w1");
    expect(rl.hit("w1", 5)).toEqual({ ok: true });
  });
});
