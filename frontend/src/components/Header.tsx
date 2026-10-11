"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CONFIG } from "@marxy/shared/config";
import { useBalances } from "@/hooks/useBalances";
import { formatSol, formatUsdc, shortAddress } from "@marxy/shared/format";
import { useConnectModal } from "./ConnectModal";
import { Logo } from "./Logo";

const LOW_SOL = 0.01 * 1e9;
/** Circle's faucet: pick "Solana Devnet" there. */
const USDC_FAUCET = "https://faucet.circle.com";
const SOL_FAUCET = "https://faucet.solana.com";

export function Header() {
  const { publicKey, disconnect, connected } = useWallet();
  const { open } = useConnectModal();
  const { lamports, usdc } = useBalances();
  const pathname = usePathname();
  const isAdmin = Boolean(publicKey && CONFIG.admin && publicKey.toBase58() === CONFIG.admin);

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
                  <a href={SOL_FAUCET} target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">
                    Low: get SOL ↗
                  </a>
                )}
              </span>
              <span className={`${pill} border-white/10 text-muted`}>{usdc === null ? "…" : `${formatUsdc(usdc)} USDC`}</span>
              <a
                href={USDC_FAUCET}
                target="_blank"
                rel="noreferrer"
                title="Circle's faucet: choose Solana Devnet and paste your address"
                className="rounded-full border border-accent/30 px-4 py-2 font-display font-semibold text-accent transition hover:border-accent hover:shadow-[0_0_24px_rgb(208_242_106/0.14)]"
              >
                Get devnet USDC ↗
              </a>
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
          Devnet only: tokens have no real value. Credits are paid in devnet USDC from{" "}
          <a href={USDC_FAUCET} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            faucet.circle.com ↗
          </a>{" "}
          (choose Solana Devnet); fees in devnet SOL from{" "}
          <a href={SOL_FAUCET} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            faucet.solana.com ↗
          </a>
        </div>
      )}
    </header>
  );
}
