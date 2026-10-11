import { Connection } from "@solana/web3.js";

import { RPC_URL } from "@marxy/shared/config";
import { mergeAuctions } from "@marxy/shared/freshness";
import { fetchAllAuctions, getProgram } from "@marxy/shared/program";
import type { AuctionView } from "@marxy/shared/types";
import { auctionToJson } from "@marxy/shared/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every visitor shares one RPC read per this many ms. */
const TTL_MS = 3_000;

// RPC_URL (server-only, may carry a private key) or the public browser RPC.
const program = getProgram(new Connection(process.env.RPC_URL || RPC_URL, "confirmed"));
/** Every auction seen so far, freshest copy (see freshness.ts). */
let seen: AuctionView[] = [];
let readAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  try {
    seen = mergeAuctions(seen, await fetchAllAuctions(program));
    readAt = Date.now();
  } finally {
    inflight = null;
  }
}

/** All auctions, newest first. Lobby, landing and admin poll this instead of the RPC. */
export async function GET() {
  if (Date.now() - readAt > TTL_MS) {
    inflight ??= refresh();
    try {
      await inflight;
    } catch (e) {
      // Serve the last good list while the RPC hiccups; fail only if there is none.
      // The RPC error stays in the server log: the RPC URL may carry an API key.
      console.error("GET /api/auctions: RPC read failed", e);
      if (readAt === 0) return Response.json({ error: "The Solana RPC is unavailable. Retrying…" }, { status: 502 });
    }
  }
  // The CDN (Vercel) serves one copy per 3 s to everyone, across serverless instances.
  return Response.json(
    { readAt, auctions: seen.map(auctionToJson) },
    { headers: { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10" } },
  );
}
