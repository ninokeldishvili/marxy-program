"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";

import { CONFIG, explorerAddress, explorerTx } from "@/config";
import { useBalances } from "@/hooks/useBalances";
import { useChainClock } from "@/hooks/useChainClock";
import { useProgram } from "@/hooks/useProgram";
import { useSendTx } from "@/hooks/useSendTx";
import { formatDate, formatUsdc, percent } from "@/lib/format";
import { markParticipantClosed } from "@/lib/freshness";
import type { BidEvent } from "@/lib/history";
import { ata, buyCreditsIxs, placeBidIx, refundDue, settleIx, withdrawIxs } from "@/lib/instructions";
import type { StageInfo } from "@/lib/stage";
import type { AuctionView, ParticipantView } from "@/lib/types";
import { useConnectModal } from "./ConnectModal";
import { Address, Button, Card, Countdown, CountdownRing, ProgressBar, useLot } from "./ui";

interface PanelProps {
  auction: AuctionView;
  participant: ParticipantView | null;
  stage: StageInfo;
  reload: () => void;
}

const usdcProgram = () => new PublicKey(CONFIG.usdcTokenProgram);

function usePlatformWallet(): boolean {
  const { publicKey } = useWallet();
  const me = publicKey?.toBase58();
  return Boolean(me && (me === CONFIG.admin || me === CONFIG.treasury));
}

// ------------------------------------------------------------------ buying

export function BuyPanel({ auction, participant, stage, reload }: PanelProps) {
  const { publicKey } = useWallet();
  const { open } = useConnectModal();
  const program = useProgram();
  const { usdc, usdcAtaExists } = useBalances();
  const { send, busy } = useSendTx();
  const platformWallet = usePlatformWallet();
  const owned = participant?.creditsBought ?? 0n;
  const room = auction.maxCreditsPerPlayer - owned;
  const [credits, setCredits] = useState("1");
  const n = /^\d+$/.test(credits) ? BigInt(credits) : 0n;
  const cost = n * auction.creditPrice;
  const tooMany = n > room;
  const cantAfford = usdc !== null && cost > usdc;
  const sold = percent(auction.revenue, auction.salesMinimum);

  async function buy() {
    if (!publicKey) return open();
    const sig = await send(`Buy ${n} credit${n === 1n ? "" : "s"}`, () =>
      buyCreditsIxs(program, {
        auction,
        player: publicKey,
        credits: n,
        usdcTokenProgram: usdcProgram(),
        createUsdcAta: !usdcAtaExists,
      }),
    );
    if (sig) {
      setCredits("1");
      reload();
    }
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold">Buy credits</h2>
        <p className="text-sm text-muted">
          Sales close in <Countdown seconds={stage.remaining} className="font-semibold text-ink" />
        </p>
      </div>
      <div className="mt-4">
        <ProgressBar value={sold} label={`${sold.toFixed(1)}% of the sales minimum sold`} />
      </div>
      {platformWallet ? (
        <p className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Platform wallets (admin / treasury) can&apos;t take part.</p>
      ) : room <= 0n ? (
        <p className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          You hold the maximum of <b>{owned.toString()}</b> credits for this auction. Get ready for the battle!
        </p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="text-sm text-muted">
              Credits (max {room.toString()}, {formatUsdc(auction.creditPrice)} each)
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={Number(room)}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="w-full rounded-full border border-white/10 bg-surface-2 px-5 py-2.5 font-display text-lg font-semibold tabular outline-none transition focus:border-accent focus:shadow-[0_0_24px_rgb(208_242_106/0.14)]"
              />
              <button className="cursor-pointer rounded-full border border-accent/20 px-4 py-2.5 font-display text-sm font-semibold text-muted transition hover:border-accent hover:text-accent" onClick={() => setCredits(room.toString())}>
                Max
              </button>
            </div>
          </label>
          <Button onClick={buy} disabled={busy || n <= 0n || tooMany || cantAfford} className="sm:min-w-44">
            {publicKey ? `Buy for ${formatUsdc(cost)}` : "Connect to buy"}
          </Button>
          {tooMany && <p className="text-sm text-danger sm:col-span-2">That&apos;s over your cap: at most {room.toString()} more.</p>}
          {cantAfford && !tooMany && (
            <p className="text-sm text-warn sm:col-span-2">Not enough test USDC: use “Get 100 test USDC” in the header.</p>
          )}
        </div>
      )}
      <p className="mt-4 text-sm text-muted">
        You own <b className="text-ink">{owned.toString()}</b> credit{owned === 1n ? "" : "s"} · cap {auction.maxCreditsPerPlayer.toString()}
      </p>
    </Card>
  );
}

// ------------------------------------------------------------------ withdraw

export function WithdrawButton({ auction, participant, reload, label }: Omit<PanelProps, "stage"> & { label?: string }) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const program = useProgram();
  const { now } = useChainClock();
  const { usdcAtaExists } = useBalances();
  const { send, busy } = useSendTx();
  if (!participant || !publicKey) return null;
  const refund = refundDue(auction, participant, now);
  const text = label ?? (refund > 0n ? `Refund ${formatUsdc(refund)}` : "Close out (get your rent back)");

  async function withdraw() {
    if (!publicKey || !participant) return;
    const sig = await send(refund > 0n ? "Refund" : "Close out", async () => {
      const vault = ata(new PublicKey(auction.address), new PublicKey(auction.usdcMint), usdcProgram());
      const vaultExists = (await connection.getAccountInfo(vault)) !== null;
      return withdrawIxs(program, {
        auction,
        player: publicKey,
        treasury: new PublicKey(CONFIG.treasury),
        usdcTokenProgram: usdcProgram(),
        refund,
        vaultExists,
        playerUsdcExists: usdcAtaExists,
      });
    });
    if (sig) {
      markParticipantClosed(participant.address);
      reload();
    }
  }

  return (
    <Button variant={refund > 0n ? "primary" : "ghost"} onClick={withdraw} disabled={busy}>
      {text}
    </Button>
  );
}

// ------------------------------------------------------------------ battle

export function BattlePanel({ auction, participant, stage, reload, bids }: PanelProps & { bids: BidEvent[] }) {
  const { publicKey } = useWallet();
  const { open } = useConnectModal();
  const program = useProgram();
  const { send, busy } = useSendTx();
  const me = publicKey?.toBase58();
  const youLead = auction.bidCount > 0n && auction.lastBidder === me;
  const left = participant?.creditsLeft ?? 0n;
  const remaining = stage.remaining ?? 0;
  const ended = remaining <= 0;
  const firstBid = auction.bidCount === 0n;

  let disabledReason = "";
  if (!publicKey) disabledReason = "";
  else if (!participant) disabledReason = "You didn't buy credits for this auction.";
  else if (left <= 0n) disabledReason = "You have no credits left.";
  else if (youLead) disabledReason = "You're the last bidder. Hold on!";
  else if (ended) disabledReason = "The countdown has ended.";

  async function bid() {
    if (!publicKey) return open();
    const sig = await send("Bid", async () => [await placeBidIx(program, auction, publicKey)]);
    if (sig) reload();
  }

  const urgent = remaining <= 10;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="text-center">
        <div className="mb-4 flex items-center justify-between text-[13px] text-muted">
          <span className="blink font-semibold text-danger">● LIVE</span>
          <span>{firstBid ? "Opening window: first bid within" : "Every bid resets the clock"}</span>
        </div>
        <CountdownRing seconds={remaining} total={firstBid ? auction.openingWindow : auction.countdown}>
          <span className={`font-display text-6xl font-bold leading-none tabular ${ended ? "text-3xl text-muted" : urgent ? "text-danger" : "text-ink"}`}>
            {ended ? "Settling…" : <Countdown seconds={remaining} />}
          </span>
          {!ended && <small className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">{firstBid ? "to open" : "countdown"}</small>}
        </CountdownRing>
        <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-muted">Last bidder</p>
            <p className="mt-1 font-semibold">{firstBid ? "Nobody yet" : <Address address={auction.lastBidder} />}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-muted">Your credits left</p>
            <p className="mt-1 text-lg font-bold tabular">{participant ? left.toString() : "-"}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-muted">Total bids</p>
            <p className="mt-1 text-lg font-bold tabular">{auction.bidCount.toString()}</p>
          </div>
        </div>
        <Button
          onClick={bid}
          disabled={Boolean(publicKey) && (busy || Boolean(disabledReason))}
          className="bid-pulse mt-6 w-full py-5 text-2xl"
        >
          {publicKey ? (youLead ? "You're leading" : "BID (1 credit)") : "Connect to bid"}
        </Button>
        {disabledReason && <p className="mt-2 text-sm text-muted">{disabledReason}</p>}
      </Card>
      <Card>
        <h3 className="text-lg font-semibold">Live bids</h3>
        {bids.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No bids yet. Be the first!</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {bids.slice(0, 12).map((b, i) => (
              <li key={b.bidCount.toString()} className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${i === 0 ? "bg-[#26301f] text-ink" : "bg-surface-2"}`}>
                <span className="text-muted tabular">#{b.bidCount.toString()}</span>
                <Address address={b.bidder} />
                {b.signature ? (
                  <a href={explorerTx(b.signature)} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-accent">
                    tx ↗
                  </a>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ settling

/** Shown once the countdown hits zero. Anyone may settle; the worker normally does it within seconds. */
export function SettlingPanel({ auction, stage, reload }: PanelProps) {
  const { publicKey } = useWallet();
  const { now } = useChainClock();
  const program = useProgram();
  const { send, busy } = useSendTx();
  const late = stage.deadline !== null && now - stage.deadline > 20;

  async function settle() {
    if (!publicKey) return;
    const sig = await send("Settle", async () => {
      const lotTokenProgram = (await program.provider.connection.getAccountInfo(new PublicKey(auction.lotMint)))!.owner;
      return [
        await settleIx(program, {
          auction,
          caller: publicKey,
          treasury: new PublicKey(CONFIG.treasury),
          usdcTokenProgram: usdcProgram(),
          lotTokenProgram,
        }),
      ];
    });
    if (sig) reload();
  }

  return (
    <Card className="text-center">
      <p className="font-display text-5xl font-semibold text-muted">Settling…</p>
      <p className="mt-3 text-muted">The result will appear here in a moment.</p>
      {late && publicKey && (
        <Button variant="ghost" onClick={settle} disabled={busy} className="mt-5">
          Taking a while? Settle it yourself
        </Button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ results

export function WonBanner({ auction, participant, reload, settleSignature }: Omit<PanelProps, "stage"> & { settleSignature?: string }) {
  const { publicKey } = useWallet();
  const lot = useLot(auction);
  const you = publicKey?.toBase58() === auction.lastBidder;
  return (
    <Card className={`text-center ${you ? "border-accent/40 shadow-[0_0_60px_rgb(208_242_106/0.12)]" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/img/winner.jpg" alt="" className="mx-auto h-40 w-40 object-contain [mask-image:radial-gradient(closest-side,#000_72%,transparent_100%)]" />
      <h2 className="mt-2 text-3xl font-semibold">
        {you ? (
          <>
            You won <span className="text-glow text-accent">{lot.amount}</span>!
          </>
        ) : (
          <>
            Won by <Address address={auction.lastBidder} />
          </>
        )}
      </h2>
      <p className="mt-2 text-muted">
        {auction.bidCount.toString()} bids · {lot.name}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
        <a className="text-accent hover:underline" href={explorerAddress(auction.lastBidder)} target="_blank" rel="noreferrer">
          Winner on explorer ↗
        </a>
        {settleSignature && (
          <a className="text-accent hover:underline" href={explorerTx(settleSignature)} target="_blank" rel="noreferrer">
            Settlement transaction ↗
          </a>
        )}
        <a className="text-accent hover:underline" href={explorerAddress(auction.address)} target="_blank" rel="noreferrer">
          Auction account ↗
        </a>
      </div>
      {participant && (
        <div className="mt-6 space-y-2">
          <WithdrawButton auction={auction} participant={participant} reload={reload} />
          <p className="text-xs text-muted">Unused credits burn; closing out returns your account rent.</p>
        </div>
      )}
    </Card>
  );
}

export function CancelledBanner({ auction, participant, reload }: Omit<PanelProps, "stage">) {
  return (
    <Card className="text-center">
      <h2 className="text-2xl font-semibold">This auction was cancelled.</h2>
      <p className="mt-2 text-muted">Your credits are fully refundable.</p>
      {participant ? (
        <div className="mt-5">
          <WithdrawButton auction={auction} participant={participant} reload={reload} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">You have nothing to refund here.</p>
      )}
    </Card>
  );
}

export function AuctionFacts({ auction }: { auction: AuctionView }) {
  const lot = useLot(auction);
  const items = useMemo(
    () => [
      ["Lot", lot.amount],
      ["Credit price", formatUsdc(auction.creditPrice)],
      ["Cap per player", `${auction.maxCreditsPerPlayer} credits`],
      ["Sold", `${formatUsdc(auction.revenue)} / ${formatUsdc(auction.salesMinimum)}`],
      ["Players", auction.participantCount.toString()],
      ["Sales close", formatDate(auction.salesClose)],
      ["Opening window", `${auction.openingWindow}s`],
      ["Countdown per bid", `${auction.countdown}s`],
    ],
    [auction, lot.amount],
  );
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted">{k}</dt>
            <dd className="font-display font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
