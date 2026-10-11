import { readFileSync } from "node:fs";

import type { LotType } from "@marxy/shared/catalog";
import { isAdminRequest, unauthorized } from "@marxy/shared/node/adminAuth";
import { CATALOG_PATH } from "@marxy/shared/node/paths";
import { readState } from "@marxy/shared/node/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The worker's full state plus the catalog (admin only). */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as LotType[];
  return Response.json({ state: readState(), catalog });
}
