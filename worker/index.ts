/**
 * The platform's automation: `npm start` (in worker/) or `npm run worker` (repo
 * root). Signs with the admin keypair and, every 5 s:
 *   - keeps the configured number of auctions open for sales per lot type (catalog.json),
 *   - at sales close: mock-funds (minimum met), postpones once (>= 70% sold) or settles into refunds,
 *   - settles as soon as the countdown ends or a refund path opens,
 *   - learns each lot type's margin / ladder step after every auction.
 * State: state.json in the worker folder. The admin page reads it through the
 * worker's API (api.ts).
 */
import { readFileSync } from "node:fs";

import { PublicKey } from "@solana/web3.js";

import { CONFIG, IS_CONFIGURED } from "@marxy/shared/config";
import type { LotType } from "@marxy/shared/catalog";
import { parseAmount } from "@marxy/shared/catalog";
import { friendlyError } from "@marxy/shared/errors";
import { POSTPONE_GRACE_SECONDS } from "@marxy/shared/idl";
import { fetchUsdPrices } from "@marxy/shared/jupiter";
import { applyLearning, DEFAULT_TUNING, filledEarly, type AuctionOutcome } from "@marxy/shared/learning";
import { lotCostFromPrice, priceLot } from "@marxy/shared/pricing";
import { getStage } from "@marxy/shared/stage";
import type { AuctionView } from "@marxy/shared/types";
import { CATALOG_PATH, rpcUrl } from "@marxy/shared/node/paths";
import { Platform } from "@marxy/shared/node/platform";
import { readState, writeState, type AuctionRecord, type LogEntry, type WorkerState } from "@marxy/shared/node/state";
import { startApi } from "./api";

const TICK_MS = 5_000;
/** Sales length for lot types without their own `salesMinutes`. */
const SALES_MINUTES = Number(process.env.SALES_MINUTES ?? 30);
/** Warn on the admin page when the admin wallet drops below this (it pays rent and fees). */
const LOW_SOL = Number(process.env.LOW_SOL ?? 1);
const OPENING_WINDOW = 40;
const COUNTDOWN = 25;
/** Postpone instead of cancelling when at least this share of the minimum sold. */
const POSTPONE_MIN_SHARE = 70n;
const PRICE_TTL_MS = 60_000;
const LOG_KEEP = 200;

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as LotType[];
const platform = new Platform();
const state: WorkerState = readState();
/** Lot types the admin asked to list now (POST /create), handled on the next tick. */
const pendingCreates: string[] = [];
let ticks = 0;
/** Set when a tick sent a transaction (so the auctions are worth re-reading). */
let acted = false;

// ------------------------------------------------------------------ logging

function log(action: string, extra: Omit<LogEntry, "at" | "action"> = {}) {
  const entry: LogEntry = { at: new Date().toISOString(), action, ...extra };
  const parts = [entry.at, extra.auctionId !== undefined ? `#${extra.auctionId}` : "", action];
  if (extra.signature) parts.push(`sig=${extra.signature}`);
  if (extra.error) parts.push(`error=${extra.error}`);
  (extra.error ? console.error : console.log)(parts.filter(Boolean).join(" "));
  state.log.push(entry);
  if (state.log.length > LOG_KEEP) state.log.splice(0, state.log.length - LOG_KEEP);
}

const errorText = (e: unknown) => {
  const f = friendlyError(e);
  const raw = e instanceof Error ? e.message.split("\n")[0] : String(e);
  return f.name ? `${f.name}: ${f.message}` : raw.slice(0, 300);
};

/** Run one platform action, logging its signature or error. */
async function act(auctionId: number, action: string, run: () => Promise<string>): Promise<boolean> {
  try {
    const signature = await run();
    acted = true;
    log(action, { auctionId, signature });
    return true;
  } catch (e) {
    log(`${action} failed`, { auctionId, error: errorText(e) });
    return false;
  }
}

// ------------------------------------------------------------------ pricing

const priceCache = new Map<string, { usd: number; at: number; source: string }>();

async function usdPrice(lot: LotType): Promise<{ usd: number; source: string }> {
  const cached = priceCache.get(lot.priceMint);
  if (cached && Date.now() - cached.at < PRICE_TTL_MS) return cached;
  try {
    const prices = await fetchUsdPrices(catalog.map((l) => l.priceMint));
    for (const [mint, usd] of Object.entries(prices)) priceCache.set(mint, { usd, at: Date.now(), source: "jupiter" });
  } catch (e) {
    log(`Jupiter price unavailable (${errorText(e)}), using catalog fallbacks`);
  }
  const fresh = priceCache.get(lot.priceMint);
  if (fresh && Date.now() - fresh.at < PRICE_TTL_MS) return fresh;
  return { usd: lot.fallbackUsdPrice, source: "fallback" };
}

// ------------------------------------------------------------------ actions

async function createAuction(lot: LotType, now: number, auctions: AuctionView[]): Promise<void> {
  const token = CONFIG.lotMints[lot.token];
  if (!token) throw new Error(`lot token ${lot.token} missing from src/config/devnet.json (run devnet:setup)`);
  const lotAmount = parseAmount(lot.amount, token.decimals);
  const price = await usdPrice(lot);
  const lotValue = lotCostFromPrice(price.usd, lotAmount, token.decimals);
  const tuning = state.lotTypes[lot.key] ?? { ...DEFAULT_TUNING, completed: 0 };
  const chain = await platform.config();
  const pricing = priceLot({
    lotValue,
    marginBps: Math.max(tuning.marginBps, chain.minMarginBps),
    ladderShift: tuning.ladderShift,
  });

  const maxChainId = auctions.reduce((m, a) => (a.id > m ? a.id : m), 0n);
  const id = Math.max(state.nextAuctionId, Number(maxChainId) + 1);
  const salesClose = now + (lot.salesMinutes ?? SALES_MINUTES) * 60;

  const ok = await act(
    id,
    `created ${lot.name}: cost $${lotValue / 1_000_000n} (${price.source} $${price.usd.toFixed(2)}), ` +
      `minimum $${Number(pricing.salesMinimum) / 1e6} at ${pricing.marginBps / 100}%, ` +
      `credit $${Number(pricing.creditPrice) / 1e6}, cap ${pricing.maxCreditsPerPlayer}, ${pricing.targetCredits} target credits`,
    () =>
      platform.createAuction({
        id: BigInt(id),
        lotMint: new PublicKey(token.mint),
        lotAmount,
        lotValue,
        creditPrice: pricing.creditPrice,
        salesMinimum: pricing.salesMinimum,
        salesClose,
        openingWindow: OPENING_WINDOW,
        countdown: COUNTDOWN,
      }),
  );
  state.nextAuctionId = id + 1;
  if (!ok) return;
  state.lotTypes[lot.key] = tuning;
  state.auctions[String(id)] = {
    id,
    lotType: lot.key,
    name: lot.name,
    createdAt: now,
    originalSalesClose: salesClose,
    pricing: {
      lotValue: lotValue.toString(),
      salesMinimum: pricing.salesMinimum.toString(),
      creditPrice: pricing.creditPrice.toString(),
      marginBps: pricing.marginBps,
      usdPrice: price.usd,
    },
    filledAt: null,
    minimumMetAtClose: null,
    learned: false,
  };
}

/** Refunds can be settled once the postponed close is reached, or after the postpone window. */
function canSettleShort(a: AuctionView, now: number): boolean {
  return a.postponed ? now >= a.salesClose : now > a.originalSalesClose + POSTPONE_GRACE_SECONDS;
}

async function handleActive(rec: AuctionRecord, a: AuctionView, now: number): Promise<void> {
  const s = getStage(a, now);
  const id = rec.id;
  const lot = catalog.find((l) => l.key === rec.lotType);
  if (rec.filledAt === null && s.minimumMet && now < a.salesClose) rec.filledAt = now;

  switch (s.stage) {
    case "short": {
      rec.minimumMetAtClose ??= false;
      const enough = a.revenue * 100n >= a.salesMinimum * POSTPONE_MIN_SHARE;
      if (!a.postponed && enough && now <= a.originalSalesClose + POSTPONE_GRACE_SECONDS) {
        const newClose = now + (lot?.salesMinutes ?? SALES_MINUTES) * 60;
        if (await act(id, `postponed: ${a.revenue * 100n / a.salesMinimum}% sold, new sales close in ${Math.round((newClose - now) / 60)} min`, () => platform.postpone(a, newClose))) {
          rec.postponedByWorker = true;
        }
      } else if (canSettleShort(a, now)) {
        rec.outcome = "lowSales";
        await act(id, "settled into refunds: sales minimum missed", () => platform.settle(a));
      } else if (ticks % 12 === 0) {
        log(`short, waiting for the postpone window to end (${a.originalSalesClose + POSTPONE_GRACE_SECONDS - now}s) to refund`, { auctionId: id });
      }
      return;
    }

    case "getReady":
      rec.minimumMetAtClose ??= true;
      if (!a.funded) await act(id, "lot bought (mock) and funded", () => platform.mockFund(a));
      return;

    case "settling": {
      rec.minimumMetAtClose ??= s.minimumMet;
      const what = !a.funded ? "settled into refunds: lot not funded" : a.bidCount > 0n ? "settled: lot to the winner" : "settled: no bids, lot to treasury";
      await act(id, what, () => platform.settle(a));
      return;
    }

    default:
      return;
  }
}

function outcomeOf(rec: AuctionRecord, a: AuctionView): AuctionOutcome {
  if (a.status === "settled") return "won";
  if (a.funded) return "noBids";
  if (rec.outcome === "lowSales" || rec.minimumMetAtClose === false) return "lowSales";
  if (rec.minimumMetAtClose === true) return "notFunded";
  return "cancelled";
}

function learn(rec: AuctionRecord, a: AuctionView): void {
  if (rec.learned) return;
  const outcome = outcomeOf(rec, a);
  const before = state.lotTypes[rec.lotType] ?? { ...DEFAULT_TUNING, completed: 0 };
  const facts = {
    outcome,
    postponed: a.postponed,
    filledEarly: filledEarly(rec.createdAt, rec.originalSalesClose, rec.filledAt),
  };
  const after = applyLearning(before, facts);
  state.lotTypes[rec.lotType] = { ...after, completed: before.completed + 1 };
  rec.outcome = outcome;
  rec.learned = true;
  log(
    `ended (${outcome}${facts.postponed ? ", postponed" : ""}${facts.filledEarly ? ", filled early" : ""}); ` +
      `${rec.lotType} margin ${before.marginBps / 100}% -> ${after.marginBps / 100}%, ladder shift ${before.ladderShift} -> ${after.ladderShift}`,
    { auctionId: rec.id },
  );
}

async function processCommands(now: number, auctions: AuctionView[]) {
  for (const lotType of pendingCreates.splice(0)) {
    const lot = catalog.find((l) => l.key === lotType);
    if (!lot) continue;
    log(`admin: create ${lot.name} now`);
    await createAuction(lot, now, auctions);
  }
}

// ------------------------------------------------------------------ loop

async function tick() {
  ticks += 1;
  acted = false;
  const now = await platform.now();

  // 1. Act on every live auction (fund, postpone, settle).
  let auctions = await platform.auctions();
  let byId = new Map(auctions.map((a) => [Number(a.id), a]));
  for (const rec of Object.values(state.auctions)) {
    const a = byId.get(rec.id);
    if (a?.status !== "active") continue;
    await handleActive(rec, a, now).catch((e) => log("tick failed for auction", { auctionId: rec.id, error: errorText(e) }));
  }

  // 2. Learn from auctions that ended (including any settled just now).
  if (acted) {
    auctions = await platform.auctions();
    byId = new Map(auctions.map((a) => [Number(a.id), a]));
  }
  for (const rec of Object.values(state.auctions)) {
    const a = byId.get(rec.id);
    if (!a || a.status === "active") continue;
    learn(rec, a);
  }

  // 3. Admin commands, then keep the configured number of auctions open for
  //    sales per lot type, so players always have one to join. Auctions past
  //    sales close (get ready, battle, or waiting to refund) don't count. This
  //    runs after learning, so new auctions use the latest tuning.
  await processCommands(now, auctions);
  for (const lot of catalog) {
    // An auction we created but can't see yet (lagging RPC node) counts as open.
    const open = Object.values(state.auctions).filter((r) => {
      if (r.lotType !== lot.key) return false;
      const a = byId.get(r.id);
      return a === undefined || (a.status === "active" && now < a.salesClose);
    }).length;
    if (open < lot.openAuctions) {
      await createAuction(lot, now, auctions).catch((e) => log(`create ${lot.name} failed`, { error: errorText(e) }));
      auctions = await platform.auctions();
      byId = new Map(auctions.map((a) => [Number(a.id), a]));
    }
  }

  if (ticks % 60 === 1) {
    const sol = (await platform.connection.getBalance(platform.admin.publicKey)) / 1e9;
    if (sol < LOW_SOL) log(`warning: the admin has only ${sol.toFixed(3)} SOL left`);
  }
  state.updatedAt = Date.now();
  writeState(state);
}

async function main() {
  if (!IS_CONFIGURED) throw new Error("src/config/devnet.json is empty: run `npm run devnet:setup` first");
  const chain = await platform.config();
  if (!chain.admin.equals(platform.admin.publicKey)) {
    throw new Error(`ADMIN_KEYPAIR_PATH is ${platform.admin.publicKey.toBase58()}, but the program admin is ${chain.admin.toBase58()}`);
  }
  // Host only: RPC URLs often carry an API key.
  console.log(`marxy worker: RPC ${new URL(rpcUrl()).host}, admin ${platform.admin.publicKey.toBase58()}`);
  console.log(`get-ready ${chain.getReadySecs}s (config), sales ${SALES_MINUTES} min`);
  writeState(state);

  startApi(
    {
      health: () => ({ ok: true, updatedAt: state.updatedAt }),
      state: () => ({ state, catalog }),
      create(lotType) {
        if (!catalog.some((l) => l.key === lotType)) {
          throw new Error(`unknown lot type; one of ${catalog.map((l) => l.key).join(", ")}`);
        }
        pendingCreates.push(lotType);
        return { note: "queued: the worker lists it within 5 s" };
      },
      async settle(auctionId) {
        const auction = await platform.auction(auctionId);
        if (!auction) throw new Error("auction not found");
        try {
          const signature = await platform.settle(auction);
          log("admin: settled now", { auctionId: Number(auctionId), signature });
          return { signature };
        } catch (e) {
          throw new Error(errorText(e));
        }
      },
    },
    (line) => console.log(line),
  );

  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      stopping = true;
      writeState(state);
      console.log("worker stopped");
      process.exit(0);
    });
  }
  while (!stopping) {
    const started = Date.now();
    await tick().catch((e) => log("tick failed", { error: errorText(e) }));
    await new Promise((r) => setTimeout(r, Math.max(0, TICK_MS - (Date.now() - started))));
  }
}

main().catch((e) => {
  console.error(`worker: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
