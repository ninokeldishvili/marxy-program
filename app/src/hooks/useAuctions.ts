"use client";

import { useEffect, useState } from "react";

import { fetchAllAuctions } from "@/lib/program";
import type { AuctionView } from "@/lib/types";
import { useProgram } from "./useProgram";

/** Every auction, polled every 3 s. */
export function useAuctions(): { auctions: AuctionView[] | null; error: string | null } {
  const program = useProgram();
  const [auctions, setAuctions] = useState<AuctionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await fetchAllAuctions(program);
        if (!cancelled) {
          setAuctions(all);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const id = setInterval(load, 3_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [program]);

  return { auctions, error };
}
