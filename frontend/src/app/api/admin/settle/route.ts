import { friendlyError } from "@marxy/shared/errors";
import { isAdminRequest, unauthorized } from "@marxy/shared/node/adminAuth";
import { Platform } from "@marxy/shared/node/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { auctionId } -> settle now (fails with the program's reason if it isn't time yet). */
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const { auctionId } = (await req.json().catch(() => ({}))) as { auctionId?: number | string };
  if (auctionId === undefined || !/^\d+$/.test(String(auctionId))) {
    return Response.json({ error: "send { auctionId }" }, { status: 400 });
  }
  try {
    const platform = new Platform();
    const auction = await platform.auction(BigInt(auctionId));
    if (!auction) return Response.json({ error: "auction not found" }, { status: 404 });
    const signature = await platform.settle(auction);
    return Response.json({ signature });
  } catch (e) {
    const f = friendlyError(e);
    return Response.json({ error: f.name ? `${f.name}: ${f.message}` : f.message }, { status: 400 });
  }
}
