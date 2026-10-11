// The worker's state file (state.json in the worker folder). The worker is its
// only reader and writer; the admin page sees it through the worker's API.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { WorkerState } from "@marxy/shared/workerApi";
import { STATE_PATH } from "./paths";

export type { AuctionRecord, LogEntry, LotTypeState, WorkerState } from "@marxy/shared/workerApi";

export function emptyState(): WorkerState {
  return { version: 1, nextAuctionId: 1, updatedAt: null, lotTypes: {}, auctions: {}, log: [] };
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
