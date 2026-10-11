"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import { toAuctionView, toParticipantView } from "@/lib/convert";
import { fresherAuction, fresherParticipant } from "@/lib/freshness";
import { fetchHistory, toBidEvent, type BidEvent } from "@/lib/history";
import { auctionPda, fetchAuction, fetchParticipant, participantPda } from "@/lib/program";
import type { AuctionView, ParticipantView } from "@/lib/types";
import { usePolling } from "./usePolling";
import { useProgram } from "./useProgram";

/** Websocket updates are primary; polling only catches what they miss. */
const FALLBACK_POLL_MS = 15_000;

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
 * One auction, live: account subscriptions + program events, with a 15 s
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
  // After a change (own transaction or program event): read now and twice more
  // shortly after, in case the first read lands on a lagging RPC node.
  const reload = useCallback(() => {
    const bump = () => setVersion((v) => v + 1);
    bump();
    setTimeout(bump, 2_000);
    setTimeout(bump, 5_000);
  }, []);

  // Load, then poll as a fallback for missed websocket updates (paused while
  // the tab is hidden), and reload on demand (after the player's own transactions).
  usePolling(
    async (isCancelled) => {
      try {
        const a = await fetchAuction(program, id);
        const p = publicKey ? await fetchParticipant(program, auctionPda(id), publicKey) : null;
        const pAddress = publicKey ? participantPda(auctionPda(id), publicKey).toBase58() : "";
        if (!isCancelled()) {
          // A lagging RPC node can return an older copy (or none): never go backwards.
          setAuction((prev) => (a ? fresherAuction(prev, a) : (prev ?? a)));
          setParticipant((prev) => (publicKey ? fresherParticipant(prev, p, pAddress) : null));
        }
      } catch {
        // transient; the next poll retries
      }
    },
    FALLBACK_POLL_MS,
    [program, id, publicKey, version],
  );

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
          const next = toAuctionView(address, program.coder.accounts.decode("auction", info.data));
          setAuction((prev) => fresherAuction(prev, next));
        } catch {
          // the account was closed or is unreadable; polling covers it
        }
      },
      { commitment: "confirmed" },
    );
    // The connected wallet's credits: pushed as soon as a purchase, bid or close-out lands.
    const participantAddress = publicKey ? participantPda(address, publicKey) : null;
    const participantSub = participantAddress
      ? connection.onAccountChange(
          participantAddress,
          (info) => {
            const key = participantAddress.toBase58();
            if (info.lamports === 0) return; // closed: the reload after a withdrawal handles it
            try {
              const next = toParticipantView(participantAddress, program.coder.accounts.decode("participant", info.data));
              setParticipant((prev) => fresherParticipant(prev, next, key));
            } catch {
              // unreadable; polling covers it
            }
          },
          { commitment: "confirmed" },
        )
      : null;
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
      if (participantSub !== null) connection.removeAccountChangeListener(participantSub).catch(() => {});
      listeners.forEach((l) => program.removeEventListener(l).catch(() => {}));
    };
  }, [connection, program, addressStr, publicKey, reload]);

  return { auction, participant, bids, settleSignature, reload };
}

function mergeBids(a: BidEvent[], b: BidEvent[]): BidEvent[] {
  const byCount = new Map<string, BidEvent>();
  for (const x of [...a, ...b]) byCount.set(x.bidCount.toString(), x);
  return [...byCount.values()].sort((x, y) => (x.bidCount < y.bidCount ? 1 : -1)).slice(0, 30);
}
