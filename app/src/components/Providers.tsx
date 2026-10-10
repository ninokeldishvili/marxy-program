"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo, type ReactNode } from "react";

import { RPC_URL } from "@/config";
import { ChainClockProvider } from "@/hooks/useChainClock";
import { MetaProvider } from "@/hooks/useMeta";
import { ConnectModalProvider } from "./ConnectModal";
import { ToastProvider } from "./Toasts";

export function Providers({ children }: { children: ReactNode }) {
  // Phantom is featured; other Wallet Standard wallets are detected automatically.
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <ToastProvider>
          <ConnectModalProvider>
            <ChainClockProvider>
              <MetaProvider>{children}</MetaProvider>
            </ChainClockProvider>
          </ConnectModalProvider>
        </ToastProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
