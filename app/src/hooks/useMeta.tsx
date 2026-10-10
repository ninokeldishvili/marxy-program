"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { AuctionsMeta } from "@/lib/meta";

const EMPTY: AuctionsMeta = { auctions: {}, bots: [], workerUpdatedAt: null };
const MetaContext = createContext<AuctionsMeta>(EMPTY);

/** Lot names / images and the bot list, from the worker via /api/auctions-meta. */
export const useMeta = () => useContext(MetaContext);

export function MetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<AuctionsMeta>(EMPTY);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/auctions-meta", { cache: "no-store" });
        if (res.ok && !cancelled) setMeta((await res.json()) as AuctionsMeta);
      } catch {
        // keep the last copy
      }
    }
    load();
    const id = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>;
}
