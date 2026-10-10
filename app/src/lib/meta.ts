// What GET /api/auctions-meta returns: display data the chain doesn't hold.
export interface AuctionMeta {
  lotType: string;
  name: string;
  image: string;
}

export interface AuctionsMeta {
  auctions: Record<string, AuctionMeta>;
  /** Demo bot wallets, labelled "bot" in the UI. */
  bots: string[];
  /** Last time the worker saved its state (ms), or null if it never ran. */
  workerUpdatedAt: number | null;
}
