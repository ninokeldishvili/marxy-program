// The platform's signed actions (admin keypair). Shared by the worker, the
// admin API routes and the smoke script. Server / scripts only.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { CONFIG, lotTokenByMint } from "@marxy/shared/config";
import {
  ata,
  createAuctionIx,
  fundLotIxs,
  postponeIx,
  settleIx,
  type CreateAuctionArgs,
} from "@marxy/shared/instructions";
import { fresherAuction, mergeAuctions } from "@marxy/shared/freshness";
import { chainUnixTime, configPda, fetchAllAuctions, fetchAuction, getProgram, type MarxyProgram } from "@marxy/shared/program";
import type { AuctionView } from "@marxy/shared/types";
import { loadAdmin } from "./keys";
import { rpcUrl } from "./paths";
import { sendIxs, tokenBalance } from "./send";

export interface OnChainConfig {
  admin: PublicKey;
  treasury: PublicKey;
  usdcMint: PublicKey;
  minMarginBps: number;
  /** Get-ready period (seconds) given to new auctions. */
  getReadySecs: number;
}

export class Platform {
  readonly connection: Connection;
  readonly program: MarxyProgram;
  readonly admin: Keypair;
  readonly usdcTokenProgram: PublicKey;
  private lotPrograms = new Map<string, PublicKey>();
  /** Every auction seen so far, freshest copy (see freshness.ts). */
  private seen: AuctionView[] = [];

  constructor(connection = new Connection(rpcUrl(), "confirmed"), admin = loadAdmin()) {
    this.connection = connection;
    this.admin = admin;
    this.program = getProgram(connection);
    this.usdcTokenProgram = new PublicKey(CONFIG.usdcTokenProgram);
  }

  now(): Promise<number> {
    return chainUnixTime(this.connection);
  }

  /** Every auction, merged with earlier reads so a lagging RPC node can't hide or roll one back. */
  async auctions(): Promise<AuctionView[]> {
    this.seen = mergeAuctions(this.seen, await fetchAllAuctions(this.program));
    return this.seen;
  }

  async auction(id: bigint | number): Promise<AuctionView | null> {
    const a = await fetchAuction(this.program, id);
    const known = this.seen.find((x) => x.id === BigInt(id));
    if (!a) return known ?? null;
    const fresh = fresherAuction(known, a);
    this.seen = mergeAuctions(this.seen, [fresh]);
    return fresh;
  }

  async config(): Promise<OnChainConfig> {
    const c = await this.program.account.config.fetch(configPda());
    return {
      admin: c.admin,
      treasury: c.treasury,
      usdcMint: c.usdcMint,
      minMarginBps: c.minMarginBps,
      getReadySecs: c.getReadySecs.toNumber(),
    };
  }

  /** The token program owning a lot mint (from the setup file, else from the chain). */
  async lotTokenProgram(mint: string): Promise<PublicKey> {
    const known = lotTokenByMint(mint)?.tokenProgram;
    if (known) return new PublicKey(known);
    let cached = this.lotPrograms.get(mint);
    if (!cached) {
      const info = await this.connection.getAccountInfo(new PublicKey(mint));
      if (!info) throw new Error(`lot mint ${mint} not found`);
      cached = info.owner;
      this.lotPrograms.set(mint, cached);
    }
    return cached;
  }

  async createAuction(args: Omit<CreateAuctionArgs, "admin" | "usdcMint" | "usdcTokenProgram">): Promise<string> {
    const ix = await createAuctionIx(this.program, {
      ...args,
      admin: this.admin.publicKey,
      usdcMint: new PublicKey(CONFIG.usdcMint),
      usdcTokenProgram: this.usdcTokenProgram,
    });
    return sendIxs(this.connection, [ix], this.admin);
  }

  async postpone(auction: AuctionView, newSalesClose: number): Promise<string> {
    const ix = await postponeIx(this.program, { auction, admin: this.admin.publicKey, newSalesClose });
    return sendIxs(this.connection, [ix], this.admin);
  }

  /** Funds the lot (wraps the admin's SOL for SOL lots), then fund_lot, atomically. */
  async fundLot(auction: AuctionView): Promise<string> {
    const lotTokenProgram = await this.lotTokenProgram(auction.lotMint);
    const adminHolds = await tokenBalance(
      this.connection,
      ata(this.admin.publicKey, new PublicKey(auction.lotMint), lotTokenProgram),
    );
    const ixs = await fundLotIxs(this.program, {
      auction,
      admin: this.admin.publicKey,
      lotTokenProgram,
      adminHolds,
    });
    return sendIxs(this.connection, ixs, this.admin);
  }

  /** Settle (anyone may; the admin pays the fees and any ATA rent). */
  async settle(auction: AuctionView, payer: Keypair = this.admin): Promise<string> {
    const { treasury } = await this.config();
    const ix = await settleIx(this.program, {
      auction,
      caller: payer.publicKey,
      treasury,
      usdcTokenProgram: this.usdcTokenProgram,
      lotTokenProgram: await this.lotTokenProgram(auction.lotMint),
    });
    return sendIxs(this.connection, [ix], payer);
  }
}
