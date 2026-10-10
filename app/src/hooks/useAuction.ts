"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import { toAuctionView } from "@/lib/convert";
import { fetchHistory, toBidEvent, type BidEvent } from "@/lib/history";
import { auctionPda, fetchAuction, fetchParticipant } from "@/lib/program";
import type { AuctionView, ParticipantView } from "@/lib/types";
import { useProgram } from "./useProgram";

const EVENTS = [
  "bidPlaced",
  "creditsBought",
  "lotFunded",
  "auctionPostponed",
  "auctionSettled",
  "auctionRefunding",
  "participantClosed",
] as const;

export interface LiveAuction {
  auction: AuctionView | null | undefined; // undefined = loading, null = not found
  participant: ParticipantView | null;
  bids: BidEvent[];
  settleSignature?: string;
  reload: () => void;
}

/**
 * One auction, live: account subscription + program events, with a 3 s
 * polling fallback. Also the connected wallet's participant account and a
 * feed of recent bids.
 */
export function useAuction(id: bigint): LiveAuction {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const program = useProgram();
  const [auction, setAuction] = useState<AuctionView | null | undefined>(undefined);
  const [participant, setParticipant] = useState<ParticipantView | null>(null);
  const [bids, setBids] = useState<BidEvent[]>([]);
  const [settleSignature, setSettleSignature] = useState<string>();
  const addressStr = auctionPda(id).toBase58();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Load, poll every 3 s (fallback for missed events), and reload on demand.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const a = await fetchAuction(program, id);
        const p = a && publicKey ? await fetchParticipant(program, auctionPda(id), publicKey) : null;
        if (!cancelled) {
          setAuction(a);
          setParticipant(p);
        }
      } catch {
        // transient; the next poll retries
      }
    }
    load();
    const t = setInterval(load, 3_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [program, id, publicKey, version]);

  // Bid history: on load and whenever the polled bid count or status changes,
  // so the feed stays current even when websocket events are dropped. Retries
  // a few times if the transaction history lags behind the account.
  const bidCount = auction?.bidCount;
  const status = auction?.status;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load(attempt: number) {
      try {
        const h = await fetchHistory(connection, program, addressStr);
        if (cancelled) return;
        setBids((live) => mergeBids(live, h.bids));
        if (h.settleSignature) setSettleSignature(h.settleSignature);
        const newest = h.bids[0]?.bidCount ?? 0n;
        if (bidCount !== undefined && newest < bidCount && attempt < 3) timer = setTimeout(() => load(attempt + 1), 1_500);
      } catch {
        if (!cancelled && attempt < 3) timer = setTimeout(() => load(attempt + 1), 1_500);
      }
    }
    load(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection, program, addressStr, bidCount, status]);

  // Live: account changes and program events.
  useEffect(() => {
    const address = new PublicKey(addressStr);
    const sub = connection.onAccountChange(
      address,
      (info) => {
        try {
          setAuction(toAuctionView(address, program.coder.accounts.decode("auction", info.data)));
        } catch {
          // the account was closed or is unreadable; polling covers it
        }
      },
      { commitment: "confirmed" },
    );
    const listeners = EVENTS.map((name) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      program.addEventListener(name, (event: any, _slot: number, signature: string) => {
        if (event.auction?.toBase58?.() !== addressStr) return;
        if (name === "bidPlaced") setBids((b) => mergeBids(b, [toBidEvent(event, signature)]));
        if (name === "auctionSettled") setSettleSignature(signature);
        reload();
      }),
    );
    return () => {
      connection.removeAccountChangeListener(sub).catch(() => {});
      listeners.forEach((l) => program.removeEventListener(l).catch(() => {}));
    };
  }, [connection, program, addressStr, reload]);

  return { auction, participant, bids, settleSignature, reload };
}

function mergeBids(a: BidEvent[], b: BidEvent[]): BidEvent[] {
  const byCount = new Map<string, BidEvent>();
  for (const x of [...a, ...b]) byCount.set(x.bidCount.toString(), x);
  return [...byCount.values()].sort((x, y) => (x.bidCount < y.bidCount ? 1 : -1)).slice(0, 30);
}
