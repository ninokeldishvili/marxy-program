"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, type TransactionInstruction } from "@solana/web3.js";
import { useCallback, useState } from "react";

import { useConnectModal } from "@/components/ConnectModal";
import { useToasts } from "@/components/Toasts";
import { friendlyError } from "@/lib/errors";
import { refreshBalances } from "./useBalances";

/**
 * Build -> sign in the wallet -> send through our devnet connection -> wait for
 * `confirmed`, with toasts. Sending through our own connection keeps the
 * transaction on devnet whatever network the wallet UI shows.
 */
export function useSendTx() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const { open } = useConnectModal();
  const toasts = useToasts();
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (label: string, build: () => Promise<TransactionInstruction[]>): Promise<string | null> => {
      if (!publicKey) {
        open();
        return null;
      }
      setBusy(true);
      const id = toasts.push({ kind: "pending", title: label, detail: "Confirm in your wallet…" });
      try {
        const ixs = await build();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
        let signature: string;
        if (signTransaction) {
          const signed = await signTransaction(tx);
          toasts.update(id, { detail: "Sending…" });
          signature = await connection.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
        } else {
          signature = await sendTransaction(tx, connection);
        }
        toasts.update(id, { detail: "Confirming…", signature });
        const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
        if (res.value.err) throw new Error(`failed: ${JSON.stringify(res.value.err)}`);
        toasts.update(id, { kind: "success", title: `${label}: done`, detail: undefined, signature });
        refreshBalances();
        return signature;
      } catch (e) {
        console.error(label, e);
        const f = friendlyError(e);
        toasts.update(id, { kind: "error", title: `${label} failed`, detail: f.message, networkHint: f.networkHint });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [publicKey, signTransaction, sendTransaction, connection, open, toasts],
  );

  return { send, busy };
}
