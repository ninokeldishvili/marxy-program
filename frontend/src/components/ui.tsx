"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { explorerAddress, lotTokenByMint } from "@marxy/shared/config";
import { formatDuration, formatUnits, shortAddress } from "@marxy/shared/format";
import type { AuctionView } from "@marxy/shared/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`panel rounded-[22px] border border-white/[0.06] p-6 ${className}`}>{children}</div>;
}

/** Small uppercase lime label above a heading, as on the landing page. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-display text-[13px] font-medium uppercase tracking-[0.3em] text-accent ${className}`}>{children}</p>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "glow bg-accent text-accent-ink hover:-translate-y-0.5 disabled:translate-y-0 disabled:bg-white/[0.08] disabled:text-muted",
    ghost: "border border-accent/20 text-ink hover:border-accent hover:shadow-[0_0_24px_rgb(208_242_106/0.14)] disabled:text-muted disabled:hover:border-accent/20 disabled:hover:shadow-none",
    danger: "border border-danger/50 text-danger hover:bg-danger/10 disabled:text-muted",
  }[variant];
  return (
    <button
      className={`cursor-pointer rounded-full px-6 py-3 font-display text-[15px] font-semibold tracking-[0.02em] transition duration-200 disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#9ca65e] to-accent shadow-[0_0_12px_var(--color-accent)] transition-[width] duration-500"
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

/** Shortened address, or "You" for the connected wallet. */
export function Address({ address, link = false }: { address: string; link?: boolean }) {
  const { publicKey } = useWallet();
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
    </span>
  );
}

/** Lot display data, derived from the auction's lot mint and amount. */
export function useLot(auction: AuctionView) {
  const token = lotTokenByMint(auction.lotMint);
  const amount = token ? `${formatUnits(auction.lotAmount, token.decimals)} ${token.name}` : `${auction.lotAmount} units`;
  // Brand art from public/assets/img.
  const art = token?.symbol === "tBTC" ? "lot-btc" : "lot-sol";
  return {
    name: amount,
    image: `/assets/img/${art}.jpg`,
    art,
    amount,
    symbol: token?.symbol ?? "",
  };
}

export function LotImage({ src, size = 56 }: { src: string; size?: number }) {
  // Plain <img>: small local images, no need for next/image here.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-bg object-cover ring-1 ring-accent/20 shadow-[0_0_24px_rgb(208_242_106/0.15)]"
    />
  );
}

const RING = 2 * Math.PI * 88;

/** The landing's battle ring: drains as `seconds` runs down from `total`, turns red when low. */
export function CountdownRing({ seconds, total, children }: { seconds: number; total: number; children: ReactNode }) {
  const frac = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const low = seconds <= Math.min(10, total / 3);
  const color = low ? "var(--color-danger)" : "var(--color-accent)";
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 200" className="block w-full -rotate-90" aria-hidden="true">
        <circle cx="100" cy="100" r="88" fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="10" />
        <circle
          cx="100"
          cy="100"
          r="88"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - frac)}
          style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">{children}</div>
    </div>
  );
}
