"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useState } from "react";

import { WithdrawButton } from "@/components/AuctionPanels";
import { useConnectModal } from "@/components/ConnectModal";
import { Button, Card, LotImage, useLot } from "@/components/ui";
import { useChainClock } from "@/hooks/useChainClock";
import { usePolling } from "@/hooks/usePolling";
import { useProgram } from "@/hooks/useProgram";
import { toAuctionView } from "@/lib/convert";
import { formatUsdc } from "@/lib/format";
import { fresherAuction, fresherParticipant, isParticipantClosed } from "@/lib/freshness";
import { refundDue } from "@/lib/instructions";
import { fetchParticipantsOf } from "@/lib/program";
import { getStage, type Stage } from "@/lib/stage";
import type { AuctionView, ParticipantView } from "@/lib/types";

const STATUS: Record<Stage, string> = {
  open: "Sales open",
  postponed: "Moved (refund available)",
  short: "Sales closed",
  getReady: "Get ready",
  battle: "Live",
  settling: "Settling",
  won: "Ended",
  cancelled: "Cancelled (refund available)",
};

interface Row {
  auction: AuctionView;
  participant: ParticipantView;
}

export default function MyAuctions() {
  const { publicKey } = useWallet();
  const { open } = useConnectModal();
  const program = useProgram();
  const [loaded, setLoaded] = useState<{ wallet: string; rows: Row[] } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Slow poll while visible; `reload` reads again right after a close-out.
  usePolling(
    async (isCancelled) => {
      if (!publicKey) return;
      const wallet = publicKey.toBase58();
      try {
        const participants = await fetchParticipantsOf(program, publicKey);
        const auctions = await program.account.auction.fetchMultiple(participants.map((p) => new PublicKey(p.auction)));
        const out: Row[] = [];
        participants.forEach((p, i) => {
          const a = auctions[i];
          if (a) out.push({ participant: p, auction: toAuctionView(new PublicKey(p.auction), a) });
        });
        if (!isCancelled()) setLoaded((prev) => ({ wallet, rows: mergeRows(prev?.wallet === wallet ? prev.rows : [], out) }));
      } catch {
        // keep the last result
      }
    },
    15_000,
    [program, publicKey, version],
  );

  const rows = loaded && publicKey && loaded.wallet === publicKey.toBase58() ? loaded.rows : null;

  if (!publicKey)
    return (
      <Card className="text-center">
        <p className="font-display text-lg font-semibold">Connect your wallet to see your auctions.</p>
        <Button className="mt-4" onClick={open}>
          Connect wallet
        </Button>
      </Card>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-semibold">
        My <span className="text-glow text-accent">auctions</span>
      </h1>
      {rows === null && <p className="text-muted">Loading…</p>}
      {rows?.length === 0 && (
        <p className="text-muted">
          You haven&apos;t joined an auction yet. <Link href="/" className="text-accent">Find one in the lobby.</Link>
        </p>
      )}
      {rows?.map((r) => <MyRow key={r.participant.address} row={r} reload={reload} />)}
    </div>
  );
}

/**
 * Merges a fresh read into the rows shown: a lagging RPC node can miss
 * participant accounts or return older copies, so rows only go away once this
 * browser closed them out (see freshness.ts).
 */
function mergeRows(prev: Row[], next: Row[]): Row[] {
  const byAddress = new Map(prev.map((r) => [r.participant.address, r]));
  for (const r of next) {
    const known = byAddress.get(r.participant.address);
    byAddress.set(r.participant.address, {
      auction: fresherAuction(known?.auction, r.auction),
      participant: fresherParticipant(known?.participant, r.participant, r.participant.address) ?? r.participant,
    });
  }
  return [...byAddress.values()]
    .filter((r) => !isParticipantClosed(r.participant.address))
    .sort((x, y) => (x.auction.id < y.auction.id ? 1 : -1));
}

function MyRow({ row, reload }: { row: Row; reload: () => void }) {
  const { now } = useChainClock();
  const lot = useLot(row.auction);
  const stage = getStage(row.auction, now).stage;
  const refund = refundDue(row.auction, row.participant, now);
  const ended = stage === "won" || stage === "cancelled";
  const won = stage === "won" && row.auction.lastBidder === row.participant.player;

  return (
    <Card className="flex flex-wrap items-center gap-4">
      <LotImage src={lot.image} size={44} />
      <div className="min-w-0 flex-1">
        <Link href={`/auction/${row.auction.id}`} className="font-display text-lg font-semibold transition hover:text-accent">
          {lot.name} <span className="font-normal text-muted">#{row.auction.id.toString()}</span>
        </Link>
        <p className="text-sm text-muted">
          {STATUS[stage]}
          {won && <span className="ml-2 font-semibold text-accent">You won!</span>}
        </p>
      </div>
      <div className="text-sm tabular">
        <p>
          Bought <b>{row.participant.creditsBought.toString()}</b> · left <b>{row.participant.creditsLeft.toString()}</b>
        </p>
        <p className="text-muted">
          {refund > 0n ? `Refund pending: ${formatUsdc(refund)}` : ended ? "Close-out pending (rent)" : "In play"}
        </p>
      </div>
      {(refund > 0n || ended) && <WithdrawButton auction={row.auction} participant={row.participant} reload={reload} />}
    </Card>
  );
}
