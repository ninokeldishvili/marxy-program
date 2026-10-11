// The program's IDL and on-chain constants, straight from the Anchor build
// output (`npm run sync-idl`).
import idlJson from "../idl/marxy.json";
import type { Marxy } from "../idl/marxy";

export const IDL = idlJson as Marxy;
export type { Marxy };

function constant(name: string): number {
  const c = (idlJson.constants as { name: string; value: string }[]).find((x) => x.name === name);
  if (!c) throw new Error(`constant ${name} missing from the IDL`);
  return Number(c.value);
}

export const PROGRAM_ID = idlJson.address;
/** Allowed range for the config's get-ready period (seconds between sales close and battle start). */
export const MIN_GET_READY_SECS = constant("MIN_GET_READY_SECS");
export const MAX_GET_READY_SECS = constant("MAX_GET_READY_SECS");
/** How long after the original sales close the admin may still postpone. */
export const POSTPONE_GRACE_SECONDS = constant("POSTPONE_GRACE_SECONDS");
/** 25% per-player cap, in basis points. */
export const MAX_PLAYER_SHARE_BPS = constant("MAX_PLAYER_SHARE_BPS");
export const BPS_DENOMINATOR = 10_000;
