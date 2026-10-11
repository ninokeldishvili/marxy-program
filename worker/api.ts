// The worker's admin API: plain node:http, no framework. The host gives the
// port in PORT (Railway, Render, Fly); locally it defaults to 8787.
//
//   GET  /health                 { ok, updatedAt }   no secret: for uptime checks
//   GET  /state                  { state, catalog }  the admin page's data
//   POST /create { lotType }     queue a new auction (picked up on the next tick)
//   POST /settle { auctionId }   settle now (the program refuses if it isn't time yet)
//
// Every route but /health needs the header x-admin-secret = ADMIN_API_SECRET.
// Browsers may only call it from ALLOWED_ORIGIN (comma-separated; default
// http://localhost:3000).
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { WorkerHealth, WorkerStateResponse } from "@marxy/shared/workerApi";

export interface ApiHandlers {
  health(): WorkerHealth;
  state(): WorkerStateResponse;
  /** Queues the auction; returns a note for the admin. */
  create(lotType: string): { note: string };
  settle(auctionId: bigint): Promise<{ signature: string }>;
}

const MAX_BODY = 10_000;

const allowedOrigins = () =>
  (process.env.ALLOWED_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

function isAdmin(req: IncomingMessage): boolean {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) return false;
  const given = Buffer.from(String(req.headers["x-admin-secret"] ?? ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error("body too large");
  }
  const parsed: unknown = raw ? JSON.parse(raw) : {};
  if (typeof parsed !== "object" || parsed === null) throw new Error("send a JSON object");
  return parsed as Record<string, unknown>;
}

export function startApi(handlers: ApiHandlers, log: (line: string) => void): void {
  const port = Number(process.env.PORT ?? 8787);
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins().includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "origin");
      res.setHeader("access-control-allow-headers", "content-type, x-admin-secret");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const path = new URL(req.url ?? "/", "http://worker").pathname;
    try {
      if (req.method === "GET" && path === "/health") return send(res, 200, handlers.health());
      if (!isAdmin(req)) {
        const reason = process.env.ADMIN_API_SECRET ? "wrong admin secret" : "ADMIN_API_SECRET is not set on the worker";
        return send(res, 401, { error: reason });
      }
      if (req.method === "GET" && path === "/state") return send(res, 200, handlers.state());
      if (req.method === "POST" && path === "/create") {
        const { lotType } = await readJson(req);
        if (typeof lotType !== "string") return send(res, 400, { error: "send { lotType }" });
        return send(res, 200, handlers.create(lotType));
      }
      if (req.method === "POST" && path === "/settle") {
        const { auctionId } = await readJson(req);
        if (!/^\d+$/.test(String(auctionId ?? ""))) return send(res, 400, { error: "send { auctionId }" });
        return send(res, 200, await handlers.settle(BigInt(String(auctionId))));
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  server.listen(port, () => log(`admin API on :${port} (origins: ${allowedOrigins().join(", ")})`));
}
