"use client";

import { useConnectModal } from "@/components/ConnectModal";
import { useLot } from "@/components/ui";
import { useAuctions } from "@/hooks/useAuctions";
import { useChainClock } from "@/hooks/useChainClock";
import { formatUsdc, percent, shortAddress } from "@marxy/shared/format";
import { getStage, type Stage, type StageInfo } from "@marxy/shared/stage";
import type { AuctionView } from "@marxy/shared/types";
import { Art } from "./Art";

const SHOWN = 4;

const STATUS: Record<Stage, { badge: string; cls: string; label: string; cta: string }> = {
  open: { badge: "Sales open", cls: "open", label: "Sales close in", cta: "Buy credits" },
  postponed: { badge: "Sales open", cls: "open", label: "Sales close in", cta: "Buy credits" },
  short: { badge: "Sales closed", cls: "ready", label: "Status", cta: "View auction" },
  getReady: { badge: "Get ready", cls: "ready", label: "Battle starts in", cta: "Watch battle" },
  battle: { badge: "Battle live", cls: "live", label: "Countdown", cta: "Join battle" },
  settling: { badge: "Settling", cls: "live", label: "Countdown", cta: "View result" },
  won: { badge: "Won", cls: "won", label: "Winner", cta: "View result" },
  cancelled: { badge: "Refunding", cls: "won", label: "Status", cta: "View auction" },
};

// Live battles first, then open sales, then the rest.
const ORDER: Stage[] = ["battle", "getReady", "open", "postponed", "short", "settling", "won", "cancelled"];

/** "9h 14m 02s", like the landing's demo countdowns. */
function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${p(m)}m ${p(sec)}s`;
  return `${m}m ${p(sec)}s`;
}

/** The landing's "Pick your battle" grid, filled with real on-chain auctions. */
export function LandingAuctions() {
  const { auctions, error } = useAuctions();
  const { now } = useChainClock();

  const items = (auctions ?? [])
    .map((auction) => ({ auction, stage: getStage(auction, now) }))
    .sort((a, b) => ORDER.indexOf(a.stage.stage) - ORDER.indexOf(b.stage.stage) || Number(b.auction.id - a.auction.id))
    .slice(0, SHOWN);

  let note = "Live from Solana devnet. Connect a wallet to join.";
  if (error) note = "Couldn't reach Solana right now. Connect a wallet to try again.";
  else if (auctions === null) note = "Loading auctions from the chain…";
  else if (items.length === 0) note = "New auctions open soon. Connect a wallet to be ready.";

  return (
    <>
      <p className="section__sub reveal">{note}</p>
      {items.length > 0 && (
        <div className="auctions">
          {items.map(({ auction, stage }) => (
            <LandingAuctionCard key={auction.address} auction={auction} stage={stage} />
          ))}
        </div>
      )}
    </>
  );
}

function LandingAuctionCard({ auction, stage }: { auction: AuctionView; stage: StageInfo }) {
  const { open } = useConnectModal();
  const lot = useLot(auction);
  const st = STATUS[stage.stage];
  const sold = Math.min(100, percent(auction.revenue, auction.salesMinimum));

  let meta: React.ReactNode;
  if (stage.stage === "open" || stage.stage === "postponed") {
    meta = (
      <div>
        <div className="auction__meta">
          <span>Sales minimum</span>
          <b>{Math.round(sold)}% sold</b>
        </div>
        <div className="progress" style={{ marginTop: 8 }}>
          <i style={{ width: `${sold}%` }} />
        </div>
      </div>
    );
  } else if (auction.bidCount > 0n) {
    meta = (
      <div className="auction__meta">
        <span>Last bidder</span>
        <b>{shortAddress(auction.lastBidder, 3)}</b>
      </div>
    );
  } else {
    meta = (
      <div className="auction__meta">
        <span>Sales</span>
        <b>{stage.minimumMet ? "Locked ✓" : "Below minimum"}</b>
      </div>
    );
  }

  const value =
    stage.remaining !== null && stage.stage !== "settling"
      ? fmt(stage.remaining)
      : stage.stage === "won"
        ? shortAddress(auction.lastBidder, 3)
        : st.badge;

  return (
    <article className="auction">
      <Art name={lot.art} label={lot.amount} seed={Number(auction.id)} />
      <div className="auction__body">
        <div className="auction__top">
          <span className="auction__name">{lot.amount}</span>
          <span className={`badge badge--${st.cls}`}>{st.badge}</span>
        </div>
        <div className="auction__stats">
          <div className="stat">
            <small>Credit price</small>
            <b>{formatUsdc(auction.creditPrice)}</b>
          </div>
          <div className="stat">
            <small>Max credits</small>
            <b>{auction.maxCreditsPerPlayer.toString()} / player</b>
          </div>
        </div>
        {meta}
        <div className="auction__meta">
          <span>{st.label}</span>
          <b>{value}</b>
        </div>
        <button type="button" className="btn btn--small" onClick={open}>
          {st.cta}
        </button>
      </div>
    </article>
  );
}
