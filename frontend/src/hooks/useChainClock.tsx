"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { chainUnixTime } from "@marxy/shared/program";

/**
 * Countdowns run on the chain's clock, not the browser's. The offset is
 * estimated from `getBlockTime` on a recent slot (falling back to the Clock
 * sysvar) and refreshed every 30 s while the tab is visible.
 */
interface ChainClock {
  /** Current chain time, whole seconds. Re-renders twice a second. */
  now: number;
  /** Chain time minus browser time, in seconds. */
  offset: number;
  synced: boolean;
}

const ClockContext = createContext<ChainClock>({ now: Math.floor(Date.now() / 1000), offset: 0, synced: false });

export const useChainClock = () => useContext(ClockContext);

/** web3.js reports an HTTP 429 as an Error whose message starts with "429". */
const isRateLimited = (e: unknown) => /\b429\b/.test(e instanceof Error ? e.message : String(e));

export function ChainClockProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const [offset, setOffset] = useState(0);
  const [synced, setSynced] = useState(false);
  const [browserNow, setBrowserNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    let cancelled = false;
    async function estimate() {
      // Hidden tabs don't need a fresh clock; skip instead of spending RPC calls.
      if (document.hidden) return;
      try {
        const slot = await connection.getSlot("confirmed");
        let chain: number | null = null;
        // Recent or skipped slots can have no block time (null or an error), so try the
        // previous ones. A rate-limit error (429) ends this round instead: trying more
        // slots right away would only add load to an RPC that is already refusing us.
        for (const s of [slot, slot - 1, slot - 2]) {
          chain = await connection.getBlockTime(s).catch((e: unknown) => {
            if (isRateLimited(e)) throw e;
            return null;
          });
          if (chain !== null) break;
        }
        if (chain === null) chain = await chainUnixTime(connection);
        if (!cancelled) {
          setOffset(chain - Date.now() / 1000);
          setSynced(true);
        }
      } catch {
        // keep the previous estimate
      }
    }
    estimate();
    const id = setInterval(estimate, 30_000);
    // Resync as soon as the tab is visible again
    const onVisible = () => {
      if (!document.hidden) estimate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connection]);

  useEffect(() => {
    const id = setInterval(() => setBrowserNow(Date.now() / 1000), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <ClockContext.Provider value={{ now: Math.floor(browserNow + offset), offset, synced }}>{children}</ClockContext.Provider>
  );
}
