"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { AuctionsMeta } from "@/lib/meta";
import { usePolling } from "./usePolling";

const EMPTY: AuctionsMeta = { auctions: {}, bots: [], workerUpdatedAt: null };
const MetaContext = createContext<AuctionsMeta>(EMPTY);

/** Lot names / images and the bot list, from the worker via /api/auctions-meta. */
export const useMeta = () => useContext(MetaContext);

export function MetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<AuctionsMeta>(EMPTY);
  usePolling(
    async (isCancelled) => {
      try {
        const res = await fetch("/api/auctions-meta", { cache: "no-store" });
        if (res.ok && !isCancelled()) setMeta((await res.json()) as AuctionsMeta);
      } catch {
        // keep the last copy
      }
    },
    10_000,
    [],
  );
  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>;
}
