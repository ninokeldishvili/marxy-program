"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import { formatUsdc, percent } from "@marxy/shared/format";
import type { Stage, StageInfo } from "@marxy/shared/stage";
import type { AuctionView } from "@marxy/shared/types";
import { Countdown, ProgressBar, useLot } from "./ui";

const STAGE_LABEL: Record<Stage, string> = {
  open: "Sales open",
  postponed: "Moved: sales reopened",
  short: "Sales closed",
  getReady: "Get ready",
  battle: "Battle live",
  settling: "Settling…",
  won: "Won",
  cancelled: "Cancelled",
};

// Badge colours from the landing page (.badge--open / --ready / --live / --won).
const BADGE: Record<Stage, string> = {
  open: "bg-accent/[0.14] text-accent",
  postponed: "bg-warn/[0.14] text-warn",
  short: "bg-warn/[0.14] text-warn",
  getReady: "bg-warn/[0.14] text-warn",
  battle: "blink bg-danger/[0.16] text-danger",
  settling: "bg-danger/[0.16] text-danger",
  won: "bg-white/10 text-ink",
  cancelled: "bg-white/10 text-muted",
};

const TIMER_LABEL: Partial<Record<Stage, string>> = {
  open: "Sales close in",
  postponed: "Sales close in",
  getReady: "Battle starts in",
  battle: "Countdown",
};

export function AuctionCard({ auction, stage }: { auction: AuctionView; stage: StageInfo }) {
  const lot = useLot(auction);
  const sold = percent(auction.revenue, auction.salesMinimum);
  const live = stage.stage === "battle";

  const timer = TIMER_LABEL[stage.stage];

  return (
    <Link
      href={`/auction/${auction.id}`}
      className={`panel group flex flex-col overflow-hidden rounded-[22px] border transition duration-300 hover:-translate-y-1 hover:border-accent/20 hover:shadow-[0_20px_60px_rgb(208_242_106/0.08)] ${
        live ? "border-accent/30" : "border-white/[0.06]"
      }`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-bg">
        <img
          src={lot.image}
          alt=""
          className="absolute inset-0 h-full w-full object-contain transition duration-500 [mask-image:radial-gradient(closest-side,#000_72%,transparent_100%)] group-hover:scale-110"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_25%_at_50%_78%,rgb(208_242_106/0.25),transparent_70%)]" />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-semibold">{lot.name}</p>
            <p className="text-xs text-muted">Auction #{auction.id.toString()}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.08em] ${BADGE[stage.stage]}`}>
            {STAGE_LABEL[stage.stage]}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-xs text-muted">Credit price</dt>
            <dd className="font-display font-semibold tabular">{formatUsdc(auction.creditPrice)}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-xs text-muted">Max credits</dt>
            <dd className="font-display font-semibold tabular">{auction.maxCreditsPerPlayer.toString()} / player</dd>
          </div>
        </dl>
        <div>
          <div className="mb-2 flex justify-between text-[13px] text-muted">
            <span>Sales minimum</span>
            <b className="font-medium text-ink tabular">{Math.min(100, Math.round(sold))}% sold</b>
          </div>
          <ProgressBar value={sold} />
        </div>
        {timer && (
          <div className="mt-auto flex justify-between text-[13px] text-muted">
            <span>{timer}</span>
            <Countdown seconds={stage.remaining} className={`font-display font-semibold ${live ? "text-accent" : "text-ink"}`} />
          </div>
        )}
      </div>
    </Link>
  );
}
