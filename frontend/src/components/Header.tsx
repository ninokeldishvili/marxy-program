"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { CONFIG } from "@marxy/shared/config";
import { refreshBalances, useBalances } from "@/hooks/useBalances";
import { formatSol, formatUsdc, shortAddress } from "@marxy/shared/format";
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

  const pill = "rounded-full border px-3.5 py-2 tabular";

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <span className="rounded-full bg-accent/[0.14] px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
            Devnet
          </span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-full px-3.5 py-2 transition ${pathname === n.href ? "bg-white/[0.06] text-accent" : "text-muted hover:text-accent"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {connected && (
            <>
              <span
                className={`${pill} ${lamports !== null && lamports < LOW_SOL ? "border-warn/60 text-warn" : "border-white/10 text-muted"}`}
                title="Devnet SOL pays transaction fees"
              >
                {lamports === null ? "…" : formatSol(lamports)}
                {lamports !== null && lamports < LOW_SOL && (
                  <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">
                    Low: get SOL ↗
                  </a>
                )}
              </span>
              <span className={`${pill} border-white/10 text-muted`}>{usdc === null ? "…" : `${formatUsdc(usdc)} USDC`}</span>
              <button
                onClick={claim}
                disabled={claiming}
                className="cursor-pointer rounded-full border border-accent/30 px-4 py-2 font-display font-semibold text-accent transition hover:border-accent hover:shadow-[0_0_24px_rgb(208_242_106/0.14)] disabled:opacity-50"
              >
                Get 100 test USDC
              </button>
            </>
          )}
          {connected && publicKey ? (
            <button
              onClick={() => disconnect()}
              className="cursor-pointer rounded-full bg-accent px-4 py-2 font-mono font-semibold text-accent-ink glow transition hover:-translate-y-0.5"
              title="Disconnect"
            >
              {shortAddress(publicKey.toBase58())}
            </button>
          ) : (
            <button onClick={open} className="glow cursor-pointer rounded-full bg-accent px-5 py-2 font-display font-semibold text-accent-ink transition hover:-translate-y-0.5">
              Connect Wallet
            </button>
          )}
        </div>
      </div>
      {connected && (
        <div className="mx-auto max-w-6xl px-4 pb-3 text-xs text-muted">
          Need devnet SOL for fees?{" "}
          <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            faucet.solana.com ↗
          </a>
        </div>
      )}
    </header>
  );
}
