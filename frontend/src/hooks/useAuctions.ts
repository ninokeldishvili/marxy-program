"use client";

import { useState } from "react";

import { mergeAuctions } from "@marxy/shared/freshness";
import type { AuctionView } from "@marxy/shared/types";
import { auctionFromJson, type AuctionJson } from "@marxy/shared/wire";
import { usePolling } from "./usePolling";

const POLL_MS = 5_000;

/** GET /api/auctions: every auction the server has seen, freshest copies. */
export async function fetchServerAuctions(): Promise<AuctionView[]> {
  const res = await fetch("/api/auctions", { cache: "no-store" });
  const body = (await res.json()) as { auctions?: AuctionJson[]; error?: string };
  if (!res.ok || !body.auctions) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.auctions.map(auctionFromJson);
}

/**
 * Every auction, from GET /api/auctions (one shared RPC read for all visitors),
 * polled every 5 s while the tab is visible. Lagging reads can't hide or roll
 * back auctions (see freshness.ts).
 */
export function useAuctions(): { auctions: AuctionView[] | null; error: string | null } {
  const [auctions, setAuctions] = useState<AuctionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePolling(
    async (isCancelled) => {
      try {
        const all = await fetchServerAuctions();
        if (!isCancelled()) {
          setAuctions((prev) => mergeAuctions(prev, all));
          setError(null);
        }
      } catch (e) {
        if (!isCancelled()) setError(e instanceof Error ? e.message : String(e));
      }
    },
    POLL_MS,
    [],
  );

  return { auctions, error };
}
