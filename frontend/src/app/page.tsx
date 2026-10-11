"use client";

import { AuctionCard } from "@/components/AuctionCard";
import { Eyebrow } from "@/components/ui";
import { useAuctions } from "@/hooks/useAuctions";
import { useChainClock } from "@/hooks/useChainClock";
import { getStage, groupOf, STAGE_GROUPS } from "@marxy/shared/stage";

const ENDED_SHOWN = 6;

export default function Lobby() {
  const { auctions, error } = useAuctions();
  const { now } = useChainClock();

  const withStage = (auctions ?? []).map((a) => ({ auction: a, stage: getStage(a, now) }));

  return (
    <div className="space-y-10">
      <section className="pt-4 text-center">
        <Eyebrow>Live auctions</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.08] sm:text-5xl">
          Pick your <span className="text-glow text-accent">battle</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted">
          Buy bid credits before sales close. When the battle starts, every bid costs one credit and resets the countdown.
          When it hits zero, the last bidder takes the lot.
        </p>
      </section>

      {error && <p className="rounded-2xl border border-danger/40 px-4 py-3 text-sm text-danger">Couldn&apos;t load auctions: {error}</p>}
      {auctions === null && !error && <p className="text-muted">Loading auctions…</p>}
      {auctions?.length === 0 && <p className="text-muted">No auctions yet. The worker lists new lots automatically.</p>}

      {STAGE_GROUPS.map((group) => {
        let items = withStage.filter((x) => groupOf(x.stage.stage) === group);
        if (group === "Ended") items = items.slice(0, ENDED_SHOWN);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="mb-5 flex items-center gap-2 font-display text-[13px] font-medium uppercase tracking-[0.3em] text-accent">
              {group === "Live now" && <span className="blink h-2 w-2 rounded-full bg-danger shadow-[0_0_10px_var(--color-danger)]" />}
              {group}
              <span className="tracking-normal text-muted">({items.length})</span>
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
