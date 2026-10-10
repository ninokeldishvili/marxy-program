"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import {
  AuctionFacts,
  BattlePanel,
  BuyPanel,
  CancelledBanner,
  SettlingPanel,
  WithdrawButton,
  WonBanner,
} from "@/components/AuctionPanels";
import { Card, Countdown, LotImage, useLot } from "@/components/ui";
import { useAuction } from "@/hooks/useAuction";
import { useChainClock } from "@/hooks/useChainClock";
import { formatDate } from "@/lib/format";
import { getStage } from "@/lib/stage";
import type { AuctionView } from "@/lib/types";

export default function AuctionPage() {
  const params = useParams<{ id: string }>();
  const valid = /^\d+$/.test(params.id ?? "");
  if (!valid) return <p className="text-muted">Unknown auction.</p>;
  return <AuctionScreen id={BigInt(params.id)} />;
}

function AuctionScreen({ id }: { id: bigint }) {
  const { auction, participant, bids, settleSignature, reload } = useAuction(id);
  const { now } = useChainClock();

  if (auction === undefined) return <p className="text-muted">Loading auction #{id.toString()}…</p>;
  if (auction === null)
    return (
      <p className="text-muted">
        Auction #{id.toString()} doesn&apos;t exist. <Link href="/" className="text-accent">Back to the lobby</Link>
      </p>
    );

  const stage = getStage(auction, now);
  const props = { auction, participant, stage, reload };

  return (
    <div className="space-y-6">
      <Title auction={auction} />

      {stage.stage === "open" && <BuyPanel {...props} />}

      {stage.stage === "postponed" && (
        <>
          <Card className="border-warn/50">
            <p className="text-lg font-semibold">Auction moved to {formatDate(auction.salesClose)}.</p>
            <p className="mt-1 text-muted">Keep your credits or take a full refund.</p>
            {participant && (
              <div className="mt-4">
                <WithdrawButton {...props} />
              </div>
            )}
          </Card>
          <BuyPanel {...props} />
        </>
      )}

      {stage.stage === "short" && (
        <Card className="text-center">
          <p className="text-2xl font-bold">Not enough credits were sold.</p>
          <p className="mt-2 text-muted">Hang tight: the auction will be moved or refunded.</p>
        </Card>
      )}

      {stage.stage === "getReady" && (
        <Card className="text-center">
          <p className="text-2xl font-bold sm:text-3xl">
            Credit purchases are locked. Auction is ready to start in {Math.max(1, Math.ceil((stage.remaining ?? 0) / 60))}{" "}
            min{Math.ceil((stage.remaining ?? 0) / 60) === 1 ? "" : "s"}. Get ready!
          </p>
          <p className="mt-6 text-sm uppercase tracking-widest text-muted">Battle starts in</p>
          <p className="mt-1 text-6xl font-black text-accent">
            <Countdown seconds={stage.remaining} />
          </p>
          <p className="mt-4 text-muted">
            {participant ? (
              <>
                You have <b className="text-ink">{participant.creditsLeft.toString()}</b> credits for the battle.
              </>
            ) : (
              "You didn't buy credits for this one, but you can watch the battle."
            )}
          </p>
        </Card>
      )}

      {stage.stage === "battle" && <BattlePanel {...props} bids={bids} />}
      {stage.stage === "settling" && <SettlingPanel {...props} />}
      {stage.stage === "won" && <WonBanner {...props} settleSignature={settleSignature} />}
      {stage.stage === "cancelled" && <CancelledBanner {...props} />}

      <AuctionFacts auction={auction} />
    </div>
  );
}

function Title({ auction }: { auction: AuctionView }) {
  const lot = useLot(auction);
  return (
    <div className="flex items-center gap-4">
      <LotImage src={lot.image} size={64} />
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Lobby
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">{lot.name}</h1>
        <p className="text-sm text-muted">Auction #{auction.id.toString()}</p>
      </div>
    </div>
  );
}
