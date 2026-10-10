// Anchor account (BN / PublicKey) -> plain views.
import type { PublicKey } from "@solana/web3.js";

import type { AuctionStatus, AuctionView, ParticipantView } from "./types";

interface BNLike {
  toString(): string;
}

const big = (v: BNLike) => BigInt(v.toString());
const num = (v: BNLike) => Number(v.toString());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAuctionView(address: PublicKey, a: any): AuctionView {
  return {
    address: address.toBase58(),
    id: big(a.auctionId),
    lotMint: a.lotMint.toBase58(),
    lotAmount: big(a.lotAmount),
    lotValue: big(a.lotValue),
    usdcMint: a.usdcMint.toBase58(),
    creditPrice: big(a.creditPrice),
    maxCreditsPerPlayer: big(a.maxCreditsPerPlayer),
    salesMinimum: big(a.salesMinimum),
    salesClose: num(a.salesClose),
    originalSalesClose: num(a.originalSalesClose),
    openingWindow: num(a.openingWindow),
    countdown: num(a.countdown),
    endTime: num(a.endTime),
    funded: a.funded,
    fundedTime: num(a.fundedTime),
    totalCreditsSold: big(a.totalCreditsSold),
    revenue: big(a.revenue),
    participantCount: Number(a.participantCount),
    bidCount: big(a.bidCount),
    lastBidder: a.lastBidder.toBase58(),
    status: Object.keys(a.status)[0] as AuctionStatus,
    postponed: a.postponed,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toParticipantView(address: PublicKey, p: any): ParticipantView {
  return {
    address: address.toBase58(),
    auction: p.auction.toBase58(),
    player: p.player.toBase58(),
    creditsBought: big(p.creditsBought),
    creditsLeft: big(p.creditsLeft),
  };
}
