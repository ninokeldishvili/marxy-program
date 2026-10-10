import { readFileSync } from "node:fs";

import type { LotType } from "@/lib/catalog";
import { isAdminRequest, unauthorized } from "@/lib/node/adminAuth";
import { enqueueCommand } from "@/lib/node/commands";
import { CATALOG_PATH } from "@/lib/node/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { lotType } -> the worker creates an auction of that type on its next tick. */
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const { lotType } = (await req.json().catch(() => ({}))) as { lotType?: string };
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as LotType[];
  if (!lotType || !catalog.some((l) => l.key === lotType)) {
    return Response.json({ error: `unknown lot type; one of ${catalog.map((l) => l.key).join(", ")}` }, { status: 400 });
  }
  enqueueCommand({ type: "create", lotType });
  return Response.json({ queued: true, note: "The worker picks this up within 5 seconds." });
}
