"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo, type ReactNode } from "react";

import { RPC_URL } from "@marxy/shared/config";
import { ChainClockProvider } from "@/hooks/useChainClock";
import { ConnectModalProvider } from "./ConnectModal";
import { ToastProvider } from "./Toasts";

export function Providers({ children }: { children: ReactNode }) {
  // Phantom is featured; other Wallet Standard wallets are detected automatically.
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  // No automatic retries on 429: web3.js would retry each rate-limited call up to 5 times,
  // turning one refused request into a burst. Callers already poll and keep their last value.
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed", disableRetryOnRateLimit: true }}>
      <WalletProvider wallets={wallets} autoConnect>
        <ToastProvider>
          <ConnectModalProvider>
            <ChainClockProvider>{children}</ChainClockProvider>
          </ConnectModalProvider>
        </ToastProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
