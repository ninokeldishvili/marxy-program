// USD prices from the Jupiter Price API (v3). Lite endpoint by default; with
// JUP_API_KEY the keyed endpoint is used instead.
export function jupiterPriceUrl(): string {
  if (process.env.JUP_PRICE_URL) return process.env.JUP_PRICE_URL;
  return process.env.JUP_API_KEY ? "https://api.jup.ag/price/v3" : "https://lite-api.jup.ag/price/v3";
}

/** mint -> USD price. Mints without a reliable price are missing from the result. */
export async function fetchUsdPrices(mints: string[], timeoutMs = 8_000): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const url = `${jupiterPriceUrl()}?ids=${[...new Set(mints)].join(",")}`;
  const headers: Record<string, string> = {};
  if (process.env.JUP_API_KEY) headers["x-api-key"] = process.env.JUP_API_KEY;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Jupiter price API ${res.status}`);
  const body = (await res.json()) as Record<string, { usdPrice?: number } | null>;
  const out: Record<string, number> = {};
  for (const [mint, v] of Object.entries(body)) {
    if (v && typeof v.usdPrice === "number" && v.usdPrice > 0) out[mint] = v.usdPrice;
  }
  return out;
}
