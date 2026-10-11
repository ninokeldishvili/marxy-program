"use client";

import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { useMemo } from "react";

import { getProgram, type MarxyProgram } from "@marxy/shared/program";

/** The Marxy program client, bound to the connected wallet when there is one. */
export function useProgram(): MarxyProgram {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  return useMemo(() => getProgram(connection, wallet ?? undefined), [connection, wallet]);
}
