"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useToasts } from "@/components/Toasts";
import { Button, Card } from "@/components/ui";
import { CONFIG, explorerTx } from "@/config";
import { useAuctions } from "@/hooks/useAuctions";
import { useChainClock } from "@/hooks/useChainClock";
import type { LotType } from "@/lib/catalog";
import { formatUsdc } from "@/lib/format";
import type { WorkerState } from "@/lib/node/state";
import { getStage } from "@/lib/stage";

const SECRET_KEY = "marxy-admin-secret";

export default function AdminPage() {
  const { publicKey } = useWallet();
  if (!publicKey || publicKey.toBase58() !== CONFIG.admin) {
    return <p className="text-muted">This page is only available to the platform admin wallet.</p>;
  }
  return <AdminConsole />;
}

function AdminConsole() {
  const toasts = useToasts();
  const { auctions } = useAuctions();
  const { now, offset } = useChainClock();
  const [secret, setSecret] = useState(() => {
    try {
      return sessionStorage.getItem(SECRET_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [data, setData] = useState<{ state: WorkerState; catalog: LotType[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    try {
      sessionStorage.setItem(SECRET_KEY, secret);
    } catch {
      // private mode
    }
    if (!secret) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/state", { headers: { "x-admin-secret": secret }, cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error);
          setData(null);
        } else {
          setError(null);
          setData(body);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secret, version]);

  async function post(path: string, body: object, label: string) {
    const id = toasts.push({ kind: "pending", title: label });
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(body),
    });
    const out = (await res.json()) as { error?: string; signature?: string; note?: string };
    if (res.ok) toasts.update(id, { kind: "success", title: `${label}: ok`, detail: out.note, signature: out.signature });
    else toasts.update(id, { kind: "error", title: `${label} failed`, detail: out.error });
    setVersion((v) => v + 1);
  }

  // Browser time from the chain clock (now - offset): Date.now() can't be called while rendering.
  const browserNowMs = (now - offset) * 1000;
  const heartbeat = data?.state.updatedAt ? Math.max(0, Math.round((browserNowMs - data.state.updatedAt) / 1000)) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Admin</h1>
      <Card>
        <label className="block text-sm text-muted">
          ADMIN_API_SECRET
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-ink outline-none focus:border-accent"
          />
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {data && (
          <p className={`mt-2 text-sm ${heartbeat !== null && heartbeat < 20 ? "text-accent" : "text-warn"}`}>
            Worker {heartbeat === null ? "has never run" : `last seen ${heartbeat}s ago`}
          </p>
        )}
      </Card>

      {data && (
        <>
          <Card>
            <h2 className="font-bold">Lot types</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {data.catalog.map((lot) => {
                const t = data.state.lotTypes[lot.key];
                return (
                  <div key={lot.key} className="rounded-xl bg-surface-2 p-4">
                    <p className="font-semibold">{lot.name}</p>
                    <p className="text-sm text-muted">
                      margin {((t?.marginBps ?? 2300) / 100).toFixed(0)}% · ladder shift {t?.ladderShift ?? 0} · {t?.completed ?? 0} done · keep {lot.liveAuctions} live
                    </p>
                    <Button className="mt-3" variant="ghost" onClick={() => post("/api/admin/create", { lotType: lot.key }, `Create ${lot.name}`)}>
                      Create auction now
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="font-bold">Auctions (worker view)</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="py-2 pr-3">#</th>
                    <th className="pr-3">Lot</th>
                    <th className="pr-3">Stage</th>
                    <th className="pr-3">Sold / minimum</th>
                    <th className="pr-3">Credit</th>
                    <th className="pr-3">Margin</th>
                    <th className="pr-3">Outcome</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {Object.values(data.state.auctions)
                    .sort((a, b) => b.id - a.id)
                    .slice(0, 30)
                    .map((rec) => {
                      const a = auctions?.find((x) => Number(x.id) === rec.id);
                      const stage = a ? getStage(a, now) : null;
                      return (
                        <tr key={rec.id} className="border-t border-line">
                          <td className="py-2 pr-3">
                            <Link href={`/auction/${rec.id}`} className="text-accent">
                              {rec.id}
                            </Link>
                          </td>
                          <td className="pr-3">{rec.name}</td>
                          <td className="pr-3">{stage?.stage ?? "?"}</td>
                          <td className="pr-3 tabular">{a ? `${formatUsdc(a.revenue)} / ${formatUsdc(a.salesMinimum)}` : "-"}</td>
                          <td className="pr-3 tabular">{formatUsdc(BigInt(rec.pricing.creditPrice))}</td>
                          <td className="pr-3">{rec.pricing.marginBps / 100}%</td>
                          <td className="pr-3">{rec.outcome ?? "-"}</td>
                          <td>
                            {a?.status === "active" && (
                              <button className="text-accent hover:underline" onClick={() => post("/api/admin/settle", { auctionId: rec.id }, `Settle #${rec.id}`)}>
                                Settle now
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="font-bold">Worker log</h2>
            <ul className="mt-3 max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
              {[...data.state.log].reverse().map((l, i) => (
                <li key={i} className={l.error ? "text-danger" : "text-muted"}>
                  {l.at.slice(11, 19)} {l.auctionId !== undefined ? `#${l.auctionId} ` : ""}
                  <span className="text-ink">{l.action}</span>
                  {l.error ? ` (${l.error})` : ""}
                  {l.signature && (
                    <a className="ml-2 text-accent" href={explorerTx(l.signature)} target="_blank" rel="noreferrer">
                      tx ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
