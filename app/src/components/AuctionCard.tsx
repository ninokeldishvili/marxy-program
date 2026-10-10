"use client";

import Link from "next/link";

import { formatUsdc, percent } from "@/lib/format";
import type { StageInfo } from "@/lib/stage";
import type { AuctionView } from "@/lib/types";
import { Countdown, LotImage, ProgressBar, useLot } from "./ui";

const STAGE_LABEL: Record<StageInfo["stage"], string> = {
  open: "Open for sales",
  postponed: "Moved: sales reopened",
  short: "Sales closed",
  getReady: "Get ready",
  battle: "Live",
  settling: "Settling…",
  won: "Won",
  cancelled: "Cancelled",
};

export function AuctionCard({ auction, stage }: { auction: AuctionView; stage: StageInfo }) {
  const lot = useLot(auction);
  const sold = percent(auction.revenue, auction.salesMinimum);
  const live = stage.stage === "battle";

  let timer: React.ReactNode = null;
  if (stage.stage === "open" || stage.stage === "postponed") {
    timer = (
      <>
        Sales close in <Countdown seconds={stage.remaining} className="font-semibold text-ink" />
      </>
    );
  } else if (stage.stage === "getReady") {
    timer = (
      <>
        Battle starts in <Countdown seconds={stage.remaining} className="font-semibold text-ink" />
      </>
    );
  } else if (live) {
    timer = (
      <>
        Ends in <Countdown seconds={stage.remaining} className="font-semibold text-accent" />
      </>
    );
  }

  return (
    <Link
      href={`/auction/${auction.id}`}
      className={`group block rounded-2xl border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent/60 ${
        live ? "border-accent/50" : "border-line"
      }`}
    >
      <div className="flex items-center gap-4">
        <LotImage src={lot.image} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{lot.name}</p>
          <p className="text-sm text-muted">Auction #{auction.id.toString()}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            live ? "bg-accent text-bg" : stage.stage === "won" ? "bg-accent-2/20 text-accent-2" : "bg-surface-2 text-muted"
          }`}
        >
          {STAGE_LABEL[stage.stage]}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">Credit price</dt>
          <dd className="font-semibold tabular">{formatUsdc(auction.creditPrice)}</dd>
        </div>
        <div>
          <dt className="text-muted">Your cap</dt>
          <dd className="font-semibold tabular">{auction.maxCreditsPerPlayer.toString()} credits</dd>
        </div>
      </dl>
      <div className="mt-4">
        <ProgressBar value={sold} label={`${sold.toFixed(0)}% of the sales minimum sold`} />
      </div>
      {timer && <p className="mt-3 text-sm text-muted">{timer}</p>}
    </Link>
  );
}
