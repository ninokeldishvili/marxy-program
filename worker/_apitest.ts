import { startApi } from "./api";
startApi(
  {
    health: () => ({ ok: true, updatedAt: 123 }),
    state: () => ({ state: { version: 1, nextAuctionId: 1, updatedAt: 123, lotTypes: {}, auctions: {}, log: [] }, catalog: [] }),
    create: (lotType) => { if (lotType !== "sol-half") throw new Error("unknown lot type"); return { note: "queued" }; },
    settle: async (id) => ({ signature: `sig-${id}` }),
  },
  (l) => console.log(l),
);
