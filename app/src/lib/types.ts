// Plain views of the on-chain accounts: bigint for amounts, numbers for unix times.
export type AuctionStatus = "active" | "settled" | "refunding";

export interface AuctionView {
  address: string;
  id: bigint;
  lotMint: string;
  lotAmount: bigint;
  lotValue: bigint;
  usdcMint: string;
  creditPrice: bigint;
  maxCreditsPerPlayer: bigint;
  salesMinimum: bigint;
  salesClose: number;
  originalSalesClose: number;
  /** Seconds from sales close to battle start, fixed when the auction was created. */
  getReadySecs: number;
  openingWindow: number;
  countdown: number;
  endTime: number;
  funded: boolean;
  fundedTime: number;
  totalCreditsSold: bigint;
  revenue: bigint;
  participantCount: number;
  bidCount: bigint;
  lastBidder: string;
  status: AuctionStatus;
  postponed: boolean;
}

export interface ParticipantView {
  address: string;
  auction: string;
  player: string;
  creditsBought: bigint;
  creditsLeft: bigint;
}

export const DEFAULT_PUBKEY = "11111111111111111111111111111111";
