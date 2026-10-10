// Recent program events for one auction, parsed from transaction logs.
import { EventParser } from "@anchor-lang/core";
import { PublicKey, type Connection } from "@solana/web3.js";

import type { MarxyProgram } from "./program";

export interface BidEvent {
  bidder: string;
  creditsLeft: bigint;
  endTime: number;
  bidCount: bigint;
  signature?: string;
}

export interface AuctionHistory {
  bids: BidEvent[];
  settleSignature?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toBidEvent(data: any, signature?: string): BidEvent {
  return {
    bidder: data.bidder.toBase58(),
    creditsLeft: BigInt(data.creditsLeft.toString()),
    endTime: Number(data.endTime.toString()),
    bidCount: BigInt(data.bidCount.toString()),
    signature,
  };
}

/** The last `limit` transactions touching the auction, newest bids first. */
export async function fetchHistory(
  connection: Connection,
  program: MarxyProgram,
  auction: string,
  limit = 25,
): Promise<AuctionHistory> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(auction), { limit }, "confirmed");
  const ok = sigs.filter((s) => !s.err).map((s) => s.signature);
  if (ok.length === 0) return { bids: [] };
  const txs = await connection.getTransactions(ok, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const parser = new EventParser(program.programId, program.coder);
  const out: AuctionHistory = { bids: [] };
  txs.forEach((tx, i) => {
    const logs = tx?.meta?.logMessages;
    if (!logs) return;
    for (const ev of parser.parseLogs(logs)) {
      if (ev.name === "bidPlaced") out.bids.push(toBidEvent(ev.data, ok[i]));
      if (ev.name === "auctionSettled") out.settleSignature = ok[i];
    }
  });
  out.bids.sort((a, b) => (a.bidCount < b.bidCount ? 1 : -1));
  return out;
}
