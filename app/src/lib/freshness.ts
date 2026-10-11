// RPC providers load-balance reads across nodes, and a lagging node can answer
// with an older copy of an account (on Helius devnet, sometimes minutes old)
// while reporting a current slot. Auction accounts are never closed and only
// move forward, so readers keep the most advanced copy they have seen.
import type { AuctionView, ParticipantView } from "./types";

/** Fields that only grow while an auction is active (refunds lower credits sold afterwards). */
function progress(a: AuctionView): bigint[] {
  return [a.funded ? 1n : 0n, a.postponed ? 1n : 0n, a.totalCreditsSold, a.bidCount];
}

/** True when `a` is a strictly older copy of the same auction than `b`. */
export function isStale(a: AuctionView, b: AuctionView): boolean {
  if (a.status !== "active") return false;
  if (b.status !== "active") return true;
  const pa = progress(a);
  const pb = progress(b);
  return pa.every((x, i) => x <= pb[i]) && pa.some((x, i) => x < pb[i]);
}

/** The fresher of two copies of one auction: `next`, unless it is older than `prev`. */
export function fresherAuction<T extends AuctionView | null | undefined>(prev: T, next: AuctionView): AuctionView {
  return prev && isStale(next, prev) ? prev : next;
}

/**
 * Merges a new auction list into the previous one: auctions missing from the
 * new list are kept (they can't have been closed), and stale copies lose.
 * Sorted newest id first.
 */
export function mergeAuctions(prev: readonly AuctionView[] | null, next: readonly AuctionView[]): AuctionView[] {
  const byAddress = new Map((prev ?? []).map((a) => [a.address, a]));
  for (const a of next) byAddress.set(a.address, fresherAuction(byAddress.get(a.address), a));
  return [...byAddress.values()].sort((x, y) => (x.id < y.id ? 1 : x.id > y.id ? -1 : 0));
}

// Participant accounts: credits bought only grow and credits left only shrink,
// and the account is only closed by the player's own withdrawal. A missing or
// older copy is therefore stale, unless this browser just closed it out.
const closedParticipants = new Set<string>();

/** Call after a successful withdrawal: the account is gone for real. */
export function markParticipantClosed(address: string): void {
  closedParticipants.add(address);
}

export const isParticipantClosed = (address: string) => closedParticipants.has(address);

/** True when `a` is a strictly older copy of the same participant than `b`. */
export function isStaleParticipant(a: ParticipantView, b: ParticipantView): boolean {
  if (a.creditsBought !== b.creditsBought) return a.creditsBought < b.creditsBought;
  return a.creditsLeft > b.creditsLeft;
}

/**
 * The fresher participant copy. `address` is the account being read; a
 * previous copy of another account (another wallet) is ignored.
 */
export function fresherParticipant(
  prev: ParticipantView | null | undefined,
  next: ParticipantView | null,
  address: string,
): ParticipantView | null {
  if (closedParticipants.has(address)) return null;
  const known = prev?.address === address ? prev : null;
  if (!next) return known;
  return known && isStaleParticipant(next, known) ? known : next;
}
