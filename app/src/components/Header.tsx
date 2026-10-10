"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { CONFIG } from "@/config";
import { refreshBalances, useBalances } from "@/hooks/useBalances";
import { formatSol, formatUsdc, shortAddress } from "@/lib/format";
import { useConnectModal } from "./ConnectModal";
import { Logo } from "./Logo";
import { useToasts } from "./Toasts";

const LOW_SOL = 0.01 * 1e9;

export function Header() {
  const { publicKey, disconnect, connected } = useWallet();
  const { open } = useConnectModal();
  const { lamports, usdc } = useBalances();
  const toasts = useToasts();
  const pathname = usePathname();
  const [claiming, setClaiming] = useState(false);
  const isAdmin = Boolean(publicKey && CONFIG.admin && publicKey.toBase58() === CONFIG.admin);

  async function claim() {
    if (!publicKey) return open();
    setClaiming(true);
    const id = toasts.push({ kind: "pending", title: "Getting 100 test USDC" });
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const body = (await res.json()) as { signature?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? `faucet error ${res.status}`);
      toasts.update(id, { kind: "success", title: "100 test USDC on the way", signature: body.signature });
      setTimeout(refreshBalances, 1_000);
    } catch (e) {
      toasts.update(id, { kind: "error", title: "Faucet", detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setClaiming(false);
    }
  }

  const nav = [
    { href: "/", label: "Lobby" },
    { href: "/me", label: "My auctions" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent">
            Devnet
          </span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-1.5 ${pathname === n.href ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {connected && (
            <>
              <span
                className={`rounded-lg border px-2.5 py-1.5 tabular ${lamports !== null && lamports < LOW_SOL ? "border-warn/60 text-warn" : "border-line text-muted"}`}
                title="Devnet SOL pays transaction fees"
              >
                {lamports === null ? "…" : formatSol(lamports)}
                {lamports !== null && lamports < LOW_SOL && (
                  <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">
                    Low: get SOL ↗
                  </a>
                )}
              </span>
              <span className="rounded-lg border border-line px-2.5 py-1.5 tabular text-muted">{usdc === null ? "…" : `${formatUsdc(usdc)} USDC`}</span>
              <button
                onClick={claim}
                disabled={claiming}
                className="rounded-lg border border-accent/50 px-3 py-1.5 font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                Get 100 test USDC
              </button>
            </>
          )}
          {connected && publicKey ? (
            <button onClick={() => disconnect()} className="rounded-lg bg-surface-2 px-3 py-1.5 font-mono hover:bg-line" title="Disconnect">
              {shortAddress(publicKey.toBase58())}
            </button>
          ) : (
            <button onClick={open} className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-bg hover:bg-[#e6ec96]">
              Connect wallet
            </button>
          )}
        </div>
      </div>
      {connected && (
        <div className="mx-auto max-w-6xl px-4 pb-2 text-xs text-muted">
          Need devnet SOL for fees?{" "}
          <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            faucet.solana.com ↗
          </a>
        </div>
      )}
    </header>
  );
}
