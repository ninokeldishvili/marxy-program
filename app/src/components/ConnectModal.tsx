"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletIcon } from "@solana/wallet-adapter-react-ui";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const PHANTOM = "Phantom";

interface ModalApi {
  open: () => void;
}

const ModalContext = createContext<ModalApi>({ open: () => {} });

export const useConnectModal = () => useContext(ModalContext);

/** Wallet picker with Phantom always first (installed or not). */
export function ConnectModalProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const { wallets, select, connected } = useWallet();
  const open = useCallback(() => setVisible(true), []);
  const show = visible && !connected;

  const sorted = useMemo(() => {
    const usable = (s: WalletReadyState) => s === WalletReadyState.Installed || s === WalletReadyState.Loadable;
    return [...wallets].sort((a, b) => {
      if (a.adapter.name === PHANTOM) return -1;
      if (b.adapter.name === PHANTOM) return 1;
      return Number(usable(b.readyState)) - Number(usable(a.readyState));
    });
  }, [wallets]);

  const pick = (name: WalletName, readyState: WalletReadyState) => {
    if (readyState === WalletReadyState.NotDetected || readyState === WalletReadyState.Unsupported) {
      window.open(name === PHANTOM ? "https://phantom.com/download" : undefined, "_blank", "noopener");
      return;
    }
    select(name); // autoConnect connects once selected
    setVisible(false);
  };

  return (
    <ModalContext.Provider value={{ open }}>
      {children}
      {show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setVisible(false)}>
          <div className="panel w-full max-w-sm rounded-[26px] border border-accent/20 p-6 shadow-[0_30px_80px_rgb(0_0_0/0.5),0_0_60px_rgb(208_242_106/0.06)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Connect a wallet</h2>
              <button className="cursor-pointer text-2xl leading-none text-muted hover:text-accent" onClick={() => setVisible(false)} aria-label="Close">
                ×
              </button>
            </div>
            <ul className="space-y-2">
              {sorted.map(({ adapter, readyState }) => {
                const installed = readyState === WalletReadyState.Installed || readyState === WalletReadyState.Loadable;
                const phantom = adapter.name === PHANTOM;
                return (
                  <li key={adapter.name}>
                    <button
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:border-accent hover:shadow-[0_0_24px_rgb(208_242_106/0.14)] ${
                        phantom ? "border-accent/30 bg-surface-2" : "border-white/[0.06]"
                      }`}
                      onClick={() => pick(adapter.name, readyState)}
                    >
                      <WalletIcon wallet={{ adapter }} className="h-7 w-7" />
                      <span className="flex-1 font-display font-medium">{adapter.name}</span>
                      <span className={`text-xs ${installed ? "text-accent" : "text-muted"}`}>
                        {installed ? (phantom ? "Recommended" : "Detected") : "Install ↗"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Marxy runs on Solana <b>devnet</b>. In Phantom: Settings → Developer Settings → Testnet Mode → Solana Devnet.
            </p>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}
