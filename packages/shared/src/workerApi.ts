// The worker's state and its admin API responses (types only, so the frontend
// can use them without pulling in Node code).
import type { LotType } from "./catalog";
import type { AuctionOutcome, LotTuning } from "./learning";

export interface AuctionRecord {
  id: number;
  lotType: string;
  name: string;
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
  log: LogEntry[];
}

/** GET /state */
export interface WorkerStateResponse {
  state: WorkerState;
  catalog: LotType[];
}

/** GET /health (no secret needed) */
export interface WorkerHealth {
  ok: true;
  /** Last time the worker saved its state (ms), or null before the first tick. */
  updatedAt: number | null;
}
