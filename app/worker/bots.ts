// Demo bots (DEMO_BOTS=true): 20 keypairs in .keys/bots/ that top up sales to
// the minimum just before sales close and keep battles lively. Demo only.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";

import { CONFIG } from "../src/config";
import { ata, buyCreditsIxs, placeBidIx, refundDue, withdrawIxs } from "../src/lib/instructions";
import { participantPda } from "../src/lib/program";
import { ceilDiv } from "../src/lib/pricing";
import { loadOrCreateKeypair } from "../src/lib/node/keys";
import { BOTS_DIR } from "../src/lib/node/paths";
import type { Platform } from "../src/lib/node/platform";
import { accountExists, mapLimit, sendIxs, tokenAmountOf } from "../src/lib/node/send";
import type { AuctionRecord } from "../src/lib/node/state";
import { toParticipantView } from "../src/lib/convert";
import type { AuctionView, ParticipantView } from "../src/lib/types";

const BOT_COUNT = Number(process.env.BOT_COUNT ?? 20);
const BOT_SOL_TOPUP = Number(process.env.BOT_SOL ?? 0.03) * LAMPORTS_PER_SOL;
const BOT_SOL_MIN = BOT_SOL_TOPUP / 2;
const BOT_USDC_TOPUP = 500_000_000n; // 500 test USDC
const BOT_USDC_MIN = 50_000_000n;
/** Bots top up sales this many seconds before sales close. */
export const BOT_BUY_LEAD_SECS = 60;
/** Bots stop for good once a human leads with more than this many seconds left. */
const HUMAN_LEAD_SECS = 10;

type Log = (action: string, extra?: { auctionId?: number; signature?: string; error?: string }) => void;

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function loadBotKeypairs(count = BOT_COUNT): Keypair[] {
  return Array.from({ length: count }, (_, i) =>
    loadOrCreateKeypair(join(BOTS_DIR, `bot-${String(i + 1).padStart(2, "0")}.json`)).keypair,
  );
}

/** Every bot keypair on disk (also those beyond BOT_COUNT), for close-outs and labels. */
export function existingBotKeypairs(): Keypair[] {
  if (!existsSync(BOTS_DIR)) return [];
  return readdirSync(BOTS_DIR)
    .filter((f) => /^bot-\d+\.json$/.test(f))
    .sort()
    .map((f) => loadOrCreateKeypair(join(BOTS_DIR, f)).keypair);
}

export class Bots {
  readonly keypairs: Keypair[];
  private readonly set: Set<string>;

  constructor(
    private readonly platform: Platform,
    private readonly log: Log,
    keypairs = loadBotKeypairs(),
  ) {
    this.keypairs = keypairs;
    this.set = new Set(keypairs.map((k) => k.publicKey.toBase58()));
  }

  get pubkeys(): string[] {
    return this.keypairs.map((k) => k.publicKey.toBase58());
  }

  isBot(address: string): boolean {
    return this.set.has(address);
  }

  /** Give bots devnet SOL (from the admin) and mock USDC when they run low. */
  async topUp(): Promise<void> {
    const { connection, admin } = this.platform;
    const usdcMint = new PublicKey(CONFIG.usdcMint);
    const usdcProgram = this.platform.usdcTokenProgram;
    const balances = await connection.getMultipleAccountsInfo(this.keypairs.map((k) => k.publicKey));
    const botUsdcs = this.keypairs.map((k) => ata(k.publicKey, usdcMint, usdcProgram));
    const usdcAccounts = await connection.getMultipleAccountsInfo(botUsdcs);

    const solIxs: TransactionInstruction[] = [];
    const usdcIxs: TransactionInstruction[] = [];
    for (const [i, bot] of this.keypairs.entries()) {
      if ((balances[i]?.lamports ?? 0) < BOT_SOL_MIN) {
        solIxs.push(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: bot.publicKey, lamports: BOT_SOL_TOPUP }));
      }
      const botUsdc = botUsdcs[i];
      if (tokenAmountOf(usdcAccounts[i]?.data) < BOT_USDC_MIN) {
        usdcIxs.push(
          createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, botUsdc, bot.publicKey, usdcMint, usdcProgram),
          createMintToInstruction(usdcMint, botUsdc, admin.publicKey, BOT_USDC_TOPUP, [], usdcProgram),
        );
      }
    }
    for (let i = 0; i < solIxs.length; i += 10) {
      const batch = solIxs.slice(i, i + 10);
      const sig = await sendIxs(connection, batch, admin);
      this.log(`bots: sent ${batch.length} × ${BOT_SOL_TOPUP / LAMPORTS_PER_SOL} SOL`, { signature: sig });
    }
    for (let i = 0; i < usdcIxs.length; i += 8) {
      const batch = usdcIxs.slice(i, i + 8);
      const sig = await sendIxs(connection, batch, admin);
      this.log(`bots: minted test USDC to ${batch.length / 2} bots`, { signature: sig });
    }
  }

  private async participants(auction: AuctionView): Promise<(ParticipantView | null)[]> {
    const address = new PublicKey(auction.address);
    const pdas = this.keypairs.map((k) => participantPda(address, k.publicKey));
    const raw = await this.platform.program.account.participant.fetchMultiple(pdas);
    return raw.map((p, i) => (p ? toParticipantView(pdas[i], p) : null));
  }

  /** Buy just enough credits (each bot within its cap) to reach the sales minimum. */
  async fillMinimum(auction: AuctionView): Promise<void> {
    if (auction.revenue >= auction.salesMinimum) return;
    let needed = ceilDiv(auction.salesMinimum - auction.revenue, auction.creditPrice);
    const participants = await this.participants(auction);
    const orders: { bot: Keypair; credits: bigint }[] = [];
    for (const i of shuffle(this.keypairs.map((_, i) => i))) {
      if (needed <= 0n) break;
      const room = auction.maxCreditsPerPlayer - (participants[i]?.creditsBought ?? 0n);
      const take = room < needed ? room : needed;
      if (take <= 0n) continue;
      orders.push({ bot: this.keypairs[i], credits: take });
      needed -= take;
    }
    if (needed > 0n) this.log(`bots: not enough bot capacity, ${needed} credits short`, { auctionId: Number(auction.id) });

    const results = await mapLimit(orders, 4, async ({ bot, credits }) => {
      const ixs = await buyCreditsIxs(this.platform.program, {
        auction,
        player: bot.publicKey,
        credits,
        usdcTokenProgram: this.platform.usdcTokenProgram,
      });
      return { credits, sig: await sendIxs(this.platform.connection, ixs, bot) };
    });
    const id = Number(auction.id);
    for (const r of results) {
      if (r.status === "fulfilled") this.log(`bots: bought ${r.value.credits} credits`, { auctionId: id, signature: r.value.sig });
      else this.log("bots: buy failed", { auctionId: id, error: String(r.reason?.message ?? r.reason) });
    }
  }

  /** One possible bot bid per tick: late in the countdown, never against a human leader. */
  async battle(auction: AuctionView, record: AuctionRecord, remaining: number): Promise<void> {
    const id = Number(auction.id);
    if (record.botsStopped) return;
    const humanLeads = auction.bidCount > 0n && !this.isBot(auction.lastBidder);
    if (humanLeads) {
      if (remaining > HUMAN_LEAD_SECS) {
        record.botsStopped = true;
        this.log(`bots: a human leads with ${remaining}s left, bots stop`, { auctionId: id });
      }
      return;
    }
    record.botBidBudget ??= randInt(3, 8);
    if (record.botBidBudget <= 0) return;
    // Bid in the last seconds, with some randomness; leave room for confirmation.
    if (remaining > randInt(8, 15) || remaining < 3) return;

    const participants = await this.participants(auction);
    const candidates = this.keypairs.filter(
      (k, i) => (participants[i]?.creditsLeft ?? 0n) > 0n && k.publicKey.toBase58() !== auction.lastBidder,
    );
    if (candidates.length === 0) return;
    const bot = candidates[randInt(0, candidates.length - 1)];
    try {
      const ix = await placeBidIx(this.platform.program, auction, bot.publicKey);
      const sig = await sendIxs(this.platform.connection, [ix], bot);
      record.botBidBudget -= 1;
      this.log(`bots: ${bot.publicKey.toBase58().slice(0, 4)}… bid (${record.botBidBudget} bot bids left)`, {
        auctionId: id,
        signature: sig,
      });
    } catch (e) {
      this.log("bots: bid failed", { auctionId: id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** After an auction ends, close every bot participant account (refund or rent back). Returns true when done. */
  async closeOut(auction: AuctionView, now: number): Promise<boolean> {
    const { connection, program } = this.platform;
    const participants = await this.participants(auction);
    const open = participants.map((p, i) => ({ p, bot: this.keypairs[i] })).filter((x) => x.p);
    if (open.length === 0) return true;
    const { treasury } = await this.platform.config();
    const usdcMint = new PublicKey(auction.usdcMint);
    const vaultExists = await accountExists(connection, ata(new PublicKey(auction.address), usdcMint, this.platform.usdcTokenProgram));
    const results = await mapLimit(open, 4, async ({ p, bot }) => {
      const ixs = await withdrawIxs(program, {
        auction,
        player: bot.publicKey,
        treasury,
        usdcTokenProgram: this.platform.usdcTokenProgram,
        refund: refundDue(auction, p!, now),
        vaultExists,
        playerUsdcExists: true,
      });
      return sendIxs(connection, ixs, bot);
    });
    const ok = results.filter((r) => r.status === "fulfilled").length;
    this.log(`bots: closed ${ok}/${open.length} participant accounts`, { auctionId: Number(auction.id) });
    return ok === open.length;
  }
}
