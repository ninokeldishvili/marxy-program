"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { Landing } from "./landing/Landing";

// Where the wallet adapter remembers the last wallet (WalletProvider's default localStorageKey).
const WALLET_KEY = "walletName";
// How long to wait for autoConnect before giving up and showing the landing.
const RESUME_TIMEOUT_MS = 2_500;

const noSubscribe = () => () => {};
function rememberedWallet(): boolean {
  try {
    return Boolean(localStorage.getItem(WALLET_KEY));
  } catch {
    return false;
  }
}

/**
 * The landing page until a wallet connects, then the app. A returning visitor
 * whose wallet reconnects on its own goes straight to the app.
 */
export function Gate({ children }: { children: ReactNode }) {
  const { connected, connecting } = useWallet();
  const remembered = useSyncExternalStore(noSubscribe, rememberedWallet, () => false);
  const [resumeOver, setResumeOver] = useState(false);
  const [sawConnecting, setSawConnecting] = useState(false);

  if (connecting && !sawConnecting) setSawConnecting(true);

  useEffect(() => {
    const id = setTimeout(() => setResumeOver(true), RESUME_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  // Land at the top of the app after connecting from deep in the landing page (and vice versa).
  useEffect(() => {
    scrollTo(0, 0);
  }, [connected]);

  if (connected) return <>{children}</>;
  const resuming = remembered && !resumeOver && !(sawConnecting && !connecting);
  if (resuming) return <Splash />;
  return <Landing />;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/logo.png" alt="MARXY" className="h-8 w-auto animate-pulse" />
    </div>
  );
}
