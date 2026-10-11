import { readState, toMeta } from "@marxy/shared/node/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lot names / images per auction id and the bot wallets, from worker/state.json. */
export async function GET() {
  return Response.json(toMeta(readState()));
}
