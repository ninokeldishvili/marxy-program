"use client";

import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type Connection } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import { CONFIG, IS_CONFIGURED } from "@marxy/shared/config";
import { usePolling } from "./usePolling";

const POLL_MS = 30_000;

export interface Balances {
  lamports: number | null;
  usdc: bigint | null;
  usdcAtaExists: boolean;
  /** Wrapped SOL (lots are paid out in it), in lamports; 0 without a wSOL account. */
  wsol: bigint | null;
  refresh: () => void;
}

interface Loaded {
  wallet: string;
  lamports: number | null;
  usdc: bigint | null;
  usdcAtaExists: boolean;
  wsol: bigint | null;
}

async function tokenBalance(connection: Connection, account: PublicKey): Promise<bigint | null> {
  try {
    return BigInt((await connection.getTokenAccountBalance(account, "confirmed")).value.amount);
  } catch {
    return null; // no such account
  }
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
        const b = await tokenBalance(connection, ata);
        usdc = b ?? 0n;
        usdcAtaExists = b !== null;
      }
      const wsol = (await tokenBalance(connection, getAssociatedTokenAddressSync(NATIVE_MINT, publicKey, false, TOKEN_PROGRAM_ID))) ?? 0n;
      if (!isCancelled()) setLoaded({ wallet, lamports, usdc, usdcAtaExists, wsol });
    },
    POLL_MS,
    [connection, publicKey, version],
  );

  const mine = loaded && publicKey && loaded.wallet === publicKey.toBase58() ? loaded : null;
  return {
    lamports: mine?.lamports ?? null,
    usdc: mine?.usdc ?? null,
    usdcAtaExists: mine?.usdcAtaExists ?? false,
    wsol: mine?.wsol ?? null,
    refresh,
  };
}
