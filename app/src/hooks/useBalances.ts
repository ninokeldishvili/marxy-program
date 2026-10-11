"use client";

import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import { CONFIG, IS_CONFIGURED } from "@/config";
import { usePolling } from "./usePolling";

const POLL_MS = 30_000;

export interface Balances {
  lamports: number | null;
  usdc: bigint | null;
  usdcAtaExists: boolean;
  refresh: () => void;
}

interface Loaded {
  wallet: string;
  lamports: number | null;
  usdc: bigint | null;
  usdcAtaExists: boolean;
}

const listeners = new Set<() => void>();
/** Ask every balance hook to reload (after a transaction). */
export const refreshBalances = () => listeners.forEach((l) => l());

export function useBalances(): Balances {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);

  // Slow poll while visible; refreshBalances() reloads right after the player's own transactions.
  usePolling(
    async (isCancelled) => {
      if (!publicKey) return;
      const wallet = publicKey.toBase58();
      const lamports = await connection.getBalance(publicKey, "confirmed").catch(() => null);
      let usdc: bigint | null = null;
      let usdcAtaExists = false;
      if (IS_CONFIGURED) {
        const ata = getAssociatedTokenAddressSync(new PublicKey(CONFIG.usdcMint), publicKey, false, new PublicKey(CONFIG.usdcTokenProgram));
        try {
          const b = await connection.getTokenAccountBalance(ata, "confirmed");
          usdc = BigInt(b.value.amount);
          usdcAtaExists = true;
        } catch {
          usdc = 0n;
        }
      }
      if (!isCancelled()) setLoaded({ wallet, lamports, usdc, usdcAtaExists });
    },
    POLL_MS,
    [connection, publicKey, version],
  );

  const mine = loaded && publicKey && loaded.wallet === publicKey.toBase58() ? loaded : null;
  return { lamports: mine?.lamports ?? null, usdc: mine?.usdc ?? null, usdcAtaExists: mine?.usdcAtaExists ?? false, refresh };
}
