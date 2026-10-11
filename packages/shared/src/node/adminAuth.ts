// Protects the admin API routes with ADMIN_API_SECRET (header x-admin-secret).
import { timingSafeEqual } from "node:crypto";

export function isAdminRequest(req: Request): boolean {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) return false;
  const given = req.headers.get("x-admin-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized(): Response {
  return Response.json(
    { error: process.env.ADMIN_API_SECRET ? "wrong admin secret" : "ADMIN_API_SECRET is not set on the server" },
    { status: 401 },
  );
}
