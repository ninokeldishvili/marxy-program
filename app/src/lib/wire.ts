// JSON form of AuctionView for GET /api/auctions: bigint amounts travel as strings.
import type { AuctionView } from "./types";

const BIGINT_FIELDS = [
  "id",
  "lotAmount",
  "lotValue",
  "creditPrice",
  "maxCreditsPerPlayer",
  "salesMinimum",
  "totalCreditsSold",
  "revenue",
  "bidCount",
] as const satisfies readonly (keyof AuctionView)[];

type BigintField = (typeof BIGINT_FIELDS)[number];
export type AuctionJson = Omit<AuctionView, BigintField> & Record<BigintField, string>;

export function auctionToJson(a: AuctionView): AuctionJson {
  const out = { ...a } as unknown as Record<string, unknown>;
  for (const f of BIGINT_FIELDS) out[f] = a[f].toString();
  return out as AuctionJson;
}

export function auctionFromJson(j: AuctionJson): AuctionView {
  const out = { ...j } as unknown as Record<string, unknown>;
  for (const f of BIGINT_FIELDS) out[f] = BigInt(j[f]);
  return out as unknown as AuctionView;
}
