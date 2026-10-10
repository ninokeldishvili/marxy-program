"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { explorerAddress, lotTokenByMint } from "@/config";
import { useMeta } from "@/hooks/useMeta";
import { formatDuration, formatUnits, shortAddress } from "@/lib/format";
import type { AuctionView } from "@/lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-bg hover:bg-[#e6ec96] disabled:bg-line disabled:text-muted",
    ghost: "border border-line text-ink hover:border-accent/60 disabled:text-muted disabled:hover:border-line",
    danger: "border border-danger/50 text-danger hover:bg-danger/10 disabled:text-muted",
  }[variant];
  return (
    <button
      className={`rounded-xl px-4 py-2.5 font-semibold transition disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${pct >= 100 ? "bg-accent-2" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && <p className="mt-1.5 text-xs text-muted tabular">{label}</p>}
    </div>
  );
}

export function Countdown({ seconds, className = "" }: { seconds: number | null; className?: string }) {
  if (seconds === null) return null;
  return <span className={`tabular ${className}`}>{formatDuration(seconds)}</span>;
}

/** Shortened address, "You" for the connected wallet, and a "bot" tag for demo bots. */
export function Address({ address, link = false }: { address: string; link?: boolean }) {
  const { publicKey } = useWallet();
  const { bots } = useMeta();
  const you = publicKey?.toBase58() === address;
  const label = you ? "You" : shortAddress(address);
  return (
    <span className="inline-flex items-center gap-1.5">
      {link ? (
        <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className={`hover:underline ${you ? "text-accent font-semibold" : "font-mono"}`}>
          {label}
        </a>
      ) : (
        <span className={you ? "text-accent font-semibold" : "font-mono"}>{label}</span>
      )}
      {bots.includes(address) && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">bot</span>}
    </span>
  );
}

/** Lot display data: worker metadata if known, otherwise derived from the mint. */
export function useLot(auction: AuctionView) {
  const meta = useMeta().auctions[auction.id.toString()];
  const token = lotTokenByMint(auction.lotMint);
  const amount = token ? `${formatUnits(auction.lotAmount, token.decimals)} ${token.name}` : `${auction.lotAmount} units`;
  return {
    name: meta?.name ?? amount,
    image: meta?.image ?? (token?.symbol === "tBTC" ? "/lots/btc.svg" : "/lots/sol.svg"),
    amount,
    symbol: token?.symbol ?? "",
  };
}

export function LotImage({ src, size = 56 }: { src: string; size?: number }) {
  // Plain <img>: tiny local SVGs, no need for next/image here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full" />;
}
