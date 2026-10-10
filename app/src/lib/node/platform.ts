// The platform's signed actions (admin keypair). Shared by the worker, the
// admin API routes and the smoke script. Server / scripts only.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { CONFIG, lotTokenByMint } from "../../config";
import {
  ata,
  createAuctionIx,
  mockFundLotIxs,
  postponeIx,
  settleIx,
  type CreateAuctionArgs,
} from "../instructions";
import { chainUnixTime, configPda, fetchAllAuctions, fetchAuction, getProgram, type MarxyProgram } from "../program";
import type { AuctionView } from "../types";
import { loadAdmin } from "./keys";
import { rpcUrl } from "./paths";
import { sendIxs, tokenBalance } from "./send";

export interface OnChainConfig {
  admin: PublicKey;
  treasury: PublicKey;
  usdcMint: PublicKey;
  minMarginBps: number;
}

export class Platform {
  readonly connection: Connection;
  readonly program: MarxyProgram;
  readonly admin: Keypair;
  readonly usdcTokenProgram: PublicKey;
  private lotPrograms = new Map<string, PublicKey>();

  constructor(connection = new Connection(rpcUrl(), "confirmed"), admin = loadAdmin()) {
    this.connection = connection;
    this.admin = admin;
    this.program = getProgram(connection);
    this.usdcTokenProgram = new PublicKey(CONFIG.usdcTokenProgram);
  }

  now(): Promise<number> {
    return chainUnixTime(this.connection);
  }

  auctions(): Promise<AuctionView[]> {
    return fetchAllAuctions(this.program);
  }

  auction(id: bigint | number): Promise<AuctionView | null> {
    return fetchAuction(this.program, id);
  }

  async config(): Promise<OnChainConfig> {
    const c = await this.program.account.config.fetch(configPda());
    return { admin: c.admin, treasury: c.treasury, usdcMint: c.usdcMint, minMarginBps: c.minMarginBps };
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

  /** Mock purchase: mint the lot to the admin (test mint authority), then fund_lot, atomically. */
  async mockFund(auction: AuctionView): Promise<string> {
    const lotTokenProgram = await this.lotTokenProgram(auction.lotMint);
    const adminHolds = await tokenBalance(
      this.connection,
      ata(this.admin.publicKey, new PublicKey(auction.lotMint), lotTokenProgram),
    );
    const ixs = await mockFundLotIxs(this.program, {
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
