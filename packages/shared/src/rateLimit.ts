// In-memory "once per key per window" limiter (the faucet: one claim per wallet per 10 min).
export class RateLimiter {
  private last = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  /** Records a hit and allows it, or refuses with the time left until the next allowed hit. */
  hit(key: string, nowMs: number = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
    const previous = this.last.get(key);
    if (previous !== undefined && nowMs - previous < this.windowMs) {
      return { ok: false, retryAfterMs: this.windowMs - (nowMs - previous) };
    }
    this.last.set(key, nowMs);
    this.prune(nowMs);
    return { ok: true };
  }

  /** Forget a hit (e.g. the mint failed, so the wallet may retry at once). */
  undo(key: string): void {
    this.last.delete(key);
  }

  private prune(nowMs: number) {
    if (this.last.size < 10_000) return;
    for (const [k, t] of this.last) if (nowMs - t >= this.windowMs) this.last.delete(k);
  }
}
