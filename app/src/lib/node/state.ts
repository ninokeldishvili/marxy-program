// The worker's state file (worker/state.json). The worker is its only writer;
// API routes read it.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { AuctionOutcome, LotTuning } from "../learning";
import type { AuctionsMeta } from "../meta";
import { STATE_PATH } from "./paths";

export interface AuctionRecord {
  id: number;
  lotType: string;
  name: string;
  image: string;
  /** Chain time when created. */
  createdAt: number;
  originalSalesClose: number;
  pricing: { lotValue: string; salesMinimum: string; creditPrice: string; marginBps: number; usdPrice: number };
  /** First chain time the worker saw sales at the minimum. */
  filledAt: number | null;
  /** Whether the minimum was met when sales closed (set on the first tick after close). */
  minimumMetAtClose: boolean | null;
  /** Set when the worker postponed this auction. */
  postponedByWorker?: boolean;
  outcome?: AuctionOutcome;
  learned: boolean;
  /** Bot bids still allowed in this auction's battle. */
  botBidBudget?: number;
  /** Bots stopped because a human took the lead with > 10 s left. */
  botsStopped?: boolean;
  /** All bot participant accounts withdrawn. */
  botsClosedOut?: boolean;
}

export interface LotTypeState extends LotTuning {
  completed: number;
}

export interface LogEntry {
  at: string;
  action: string;
  auctionId?: number;
  signature?: string;
  error?: string;
}

export interface WorkerState {
  version: 1;
  nextAuctionId: number;
  updatedAt: number | null;
  lotTypes: Record<string, LotTypeState>;
  auctions: Record<string, AuctionRecord>;
  bots: string[];
  log: LogEntry[];
}

export function emptyState(): WorkerState {
  return { version: 1, nextAuctionId: 1, updatedAt: null, lotTypes: {}, auctions: {}, bots: [], log: [] };
}

export function readState(path = STATE_PATH): WorkerState {
  if (!existsSync(path)) return emptyState();
  try {
    return { ...emptyState(), ...(JSON.parse(readFileSync(path, "utf8")) as WorkerState) };
  } catch {
    return emptyState();
  }
}

/** Atomic write: a reader never sees a half-written file. */
export function writeState(state: WorkerState, path = STATE_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

export function toMeta(state: WorkerState): AuctionsMeta {
  return {
    auctions: Object.fromEntries(
      Object.values(state.auctions).map((a) => [String(a.id), { lotType: a.lotType, name: a.name, image: a.image }]),
    ),
    bots: state.bots,
    workerUpdatedAt: state.updatedAt,
  };
}
