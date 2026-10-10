"use client";

import { AuctionCard } from "@/components/AuctionCard";
import { useAuctions } from "@/hooks/useAuctions";
import { useChainClock } from "@/hooks/useChainClock";
import { getStage, groupOf, STAGE_GROUPS } from "@/lib/stage";

const ENDED_SHOWN = 6;

export default function Lobby() {
  const { auctions, error } = useAuctions();
  const { now } = useChainClock();

  const withStage = (auctions ?? []).map((a) => ({ auction: a, stage: getStage(a, now) }));

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Last bid <span className="text-accent">wins</span>.
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Buy bid credits before sales close. When the battle starts, every bid costs one credit and resets the countdown.
          When it hits zero, the last bidder takes the lot.
        </p>
      </section>

      {error && <p className="rounded-xl border border-danger/40 px-4 py-3 text-sm text-danger">Couldn&apos;t load auctions: {error}</p>}
      {auctions === null && !error && <p className="text-muted">Loading auctions…</p>}
      {auctions?.length === 0 && <p className="text-muted">No auctions yet. The worker lists new lots automatically.</p>}

      {STAGE_GROUPS.map((group) => {
        let items = withStage.filter((x) => groupOf(x.stage.stage) === group);
        if (group === "Ended") items = items.slice(0, ENDED_SHOWN);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
              {group === "Live now" && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />}
              {group}
              <span className="text-xs font-normal">({items.length})</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(({ auction, stage }) => (
                <AuctionCard key={auction.address} auction={auction} stage={stage} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
