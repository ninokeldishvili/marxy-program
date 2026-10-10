/**
 * Devnet smoke test: one complete auction, headless, with the demo bots.
 * create -> bots buy to the minimum -> fund -> bids -> settle -> withdraw, then
 * asserts the final balances (winner holds the lot, treasury holds the revenue,
 * losers got only their rent back).
 *
 * Needs the program built with `--features demo-timers` (2-minute get-ready),
 * a completed `npm run devnet:setup`, and an admin with ~1 SOL for the bots.
 *
 * Usage (from app/):  npm run smoke
 */
import { Keypair, PublicKey } from "@solana/web3.js";

import { CONFIG, IS_CONFIGURED } from "../src/config";
import { parseAmount } from "../src/lib/catalog";
import { ata, placeBidIx, refundDue, withdrawIxs } from "../src/lib/instructions";
import { lotCostFromPrice, priceLot } from "../src/lib/pricing";
import { fetchParticipant } from "../src/lib/program";
import { Platform } from "../src/lib/node/platform";
import { rpcUrl } from "../src/lib/node/paths";
import { sendIxs, tokenBalance } from "../src/lib/node/send";
import type { AuctionView } from "../src/lib/types";
import { Bots, loadBotKeypairs } from "../worker/bots";

const SALES_SECS = Number(process.env.SMOKE_SALES_SECS ?? 60);
const LOT_AMOUNT = process.env.SMOKE_LOT_AMOUNT ?? "0.05"; // Test SOL
const USD_PRICE = 150; // fixed, so the smoke run doesn't depend on Jupiter

const platform = new Platform();
let failures = 0;

function step(msg: string) {
  console.log(`\n▶ ${msg}`);
}

function check(ok: boolean, msg: string) {
  console.log(`  ${ok ? "✔" : "✘"} ${msg}`);
  if (!ok) failures += 1;
}

async function waitForChainTime(target: number, label: string) {
  for (;;) {
    const now = await platform.now();
    if (now >= target) return now;
    process.stdout.write(`\r  waiting for ${label}: ${target - now}s   `);
    await new Promise((r) => setTimeout(r, Math.min(3_000, (target - now) * 1_000)));
  }
}

async function refreshed(id: bigint): Promise<AuctionView> {
  const a = await platform.auction(id);
  if (!a) throw new Error(`auction ${id} not found`);
  return a;
}

async function txFee(signature: string): Promise<number> {
  for (let i = 0; i < 10; i++) {
    const tx = await platform.connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx?.meta) return tx.meta.fee;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`transaction ${signature} not found`);
}

async function main() {
  if (!IS_CONFIGURED) throw new Error("run `npm run devnet:setup` first");
  const token = CONFIG.lotMints.testSol;
  if (!token) throw new Error("Test SOL mint missing from src/config/devnet.json");
  const chain = await platform.config();
  const getReadySecs = chain.getReadySecs;
  if (getReadySecs > 300) {
    throw new Error(
      `the config's get-ready period is ${getReadySecs}s: set GET_READY_SECS=120 and run \`npm run devnet:setup -- --update-config\``,
    );
  }
  console.log(`smoke test on ${rpcUrl()} (get-ready ${getReadySecs}s)`);

  const treasury = chain.treasury;
  const usdcMint = new PublicKey(CONFIG.usdcMint);
  const usdcProgram = platform.usdcTokenProgram;
  const lotMint = new PublicKey(token.mint);
  const lotProgram = new PublicKey(token.tokenProgram);

  step("Top up the bots");
  const botKeys = loadBotKeypairs();
  const bots = new Bots(platform, (action, extra) => console.log(`  ${action}${extra?.signature ? ` ${extra.signature}` : ""}${extra?.error ? ` (${extra.error})` : ""}`), botKeys);
  await bots.topUp();

  step("Create the auction");
  const now = await platform.now();
  const lotAmount = parseAmount(LOT_AMOUNT, token.decimals);
  const lotValue = lotCostFromPrice(USD_PRICE, lotAmount, token.decimals);
  const pricing = priceLot({ lotValue, marginBps: chain.minMarginBps });
  const all = await platform.auctions();
  const id = all.reduce((m, a) => (a.id > m ? a.id : m), 0n) + 1n; // next sequential id; the worker skips taken ids
  const sig = await platform.createAuction({
    id,
    lotMint,
    lotAmount,
    lotValue,
    creditPrice: pricing.creditPrice,
    salesMinimum: pricing.salesMinimum,
    salesClose: now + SALES_SECS,
    openingWindow: 40,
    countdown: 25,
  });
  let a = await refreshed(id);
  console.log(`  auction #${id} ${a.address} (${sig})`);
  console.log(`  ${LOT_AMOUNT} Test SOL, cost ${Number(lotValue) / 1e6} USDC, minimum ${Number(pricing.salesMinimum) / 1e6} USDC, credit ${Number(pricing.creditPrice) / 1e6} USDC, cap ${pricing.maxCreditsPerPlayer}`);

  step("Bots buy credits up to the sales minimum");
  await bots.fillMinimum(a);
  a = await refreshed(id);
  check(a.revenue >= a.salesMinimum, `sales ${Number(a.revenue) / 1e6} >= minimum ${Number(a.salesMinimum) / 1e6} USDC`);
  const buyers: Keypair[] = [];
  for (const k of botKeys) {
    if (await fetchParticipant(platform.program, new PublicKey(a.address), k.publicKey)) buyers.push(k);
  }
  console.log(`  ${buyers.length} bots joined, ${a.totalCreditsSold} credits sold`);
  if (buyers.length < 2) throw new Error("need at least two buyers to bid");

  step("Sales close, then the platform funds the lot");
  await waitForChainTime(a.salesClose, "sales close");
  const fundSig = await platform.mockFund(a);
  a = await refreshed(id);
  check(a.funded, `lot funded (${fundSig})`);
  const battleStart = a.salesClose + a.getReadySecs;
  check(a.endTime === battleStart + a.openingWindow, "end time = battle start + opening window");

  step("Battle: three bids");
  await waitForChainTime(battleStart, "battle start");
  console.log("");
  const [p1, p2] = buyers;
  for (const bidder of [p1, p2, p1]) {
    a = await refreshed(id);
    const s = await sendIxs(platform.connection, [await placeBidIx(platform.program, a, bidder.publicKey)], bidder);
    console.log(`  ${bidder.publicKey.toBase58().slice(0, 4)}… bid (${s})`);
    await new Promise((r) => setTimeout(r, 3_000));
  }
  a = await refreshed(id);
  check(a.bidCount === 3n && a.lastBidder === p1.publicKey.toBase58(), "3 bids, last bidder is the winner-to-be");

  step("Countdown ends, settle");
  await waitForChainTime(a.endTime, "the countdown");
  console.log("");
  const winnerLotBefore = await tokenBalance(platform.connection, ata(p1.publicKey, lotMint, lotProgram));
  const treasuryUsdcBefore = await tokenBalance(platform.connection, ata(treasury, usdcMint, usdcProgram));
  const revenue = a.revenue;
  const settleSig = await platform.settle(a);
  a = await refreshed(id);
  console.log(`  settled (${settleSig})`);
  check(a.status === "settled", "status is Settled");
  const winnerLotAfter = await tokenBalance(platform.connection, ata(p1.publicKey, lotMint, lotProgram));
  check(winnerLotAfter - winnerLotBefore === lotAmount, `winner received ${LOT_AMOUNT} Test SOL`);
  const treasuryUsdcAfter = await tokenBalance(platform.connection, ata(treasury, usdcMint, usdcProgram));
  check(treasuryUsdcAfter - treasuryUsdcBefore === revenue, `treasury received the revenue (${Number(revenue) / 1e6} USDC)`);

  step("Everyone withdraws: rent back, no USDC (unused credits burn)");
  const after = await platform.now();
  for (const bot of buyers) {
    const participant = await fetchParticipant(platform.program, new PublicKey(a.address), bot.publicKey);
    if (!participant) continue;
    const rent = (await platform.connection.getAccountInfo(new PublicKey(participant.address)))!.lamports;
    const solBefore = await platform.connection.getBalance(bot.publicKey, "confirmed");
    const usdcBefore = await tokenBalance(platform.connection, ata(bot.publicKey, usdcMint, usdcProgram));
    const ixs = await withdrawIxs(platform.program, {
      auction: a,
      player: bot.publicKey,
      treasury,
      usdcTokenProgram: usdcProgram,
      refund: refundDue(a, participant, after),
      vaultExists: false,
      playerUsdcExists: true,
    });
    const s = await sendIxs(platform.connection, ixs, bot);
    const fee = await txFee(s);
    const solAfter = await platform.connection.getBalance(bot.publicKey, "confirmed");
    const usdcAfter = await tokenBalance(platform.connection, ata(bot.publicKey, usdcMint, usdcProgram));
    const label = bot === p1 ? "winner" : "loser ";
    check(
      solAfter - solBefore === rent - fee && usdcAfter === usdcBefore,
      `${label} ${bot.publicKey.toBase58().slice(0, 4)}…: +${rent} lamports rent (fee ${fee}), USDC unchanged`,
    );
  }

  console.log(failures === 0 ? "\nsmoke test passed" : `\nsmoke test FAILED (${failures} checks)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nsmoke: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
