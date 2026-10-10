"use client";

import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import { CONFIG, IS_CONFIGURED } from "@/config";

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

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    const wallet = publicKey.toBase58();
    async function load() {
      const lamports = await connection.getBalance(publicKey!, "confirmed").catch(() => null);
      let usdc: bigint | null = null;
      let usdcAtaExists = false;
      if (IS_CONFIGURED) {
        const ata = getAssociatedTokenAddressSync(new PublicKey(CONFIG.usdcMint), publicKey!, false, new PublicKey(CONFIG.usdcTokenProgram));
        try {
          const b = await connection.getTokenAccountBalance(ata, "confirmed");
          usdc = BigInt(b.value.amount);
          usdcAtaExists = true;
        } catch {
          usdc = 0n;
        }
      }
      if (!cancelled) setLoaded({ wallet, lamports, usdc, usdcAtaExists });
    }
    load();
    const id = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection, publicKey, version]);

  const mine = loaded && publicKey && loaded.wallet === publicKey.toBase58() ? loaded : null;
  return { lamports: mine?.lamports ?? null, usdc: mine?.usdc ?? null, usdcAtaExists: mine?.usdcAtaExists ?? false, refresh };
}
