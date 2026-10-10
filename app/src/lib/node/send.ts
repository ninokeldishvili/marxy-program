// Sign with keypairs, send, and wait for `confirmed`.
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

export async function sendIxs(
  connection: Connection,
  ixs: TransactionInstruction[],
  payer: Keypair,
  extraSigners: Keypair[] = [],
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight });
  // A small priority fee helps on a busy devnet.
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }), ...ixs);
  tx.sign(payer, ...extraSigners);
  const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
  await confirmByPolling(connection, signature, lastValidBlockHeight);
  return signature;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for `confirmed` by polling getSignatureStatuses. Unlike
 * confirmTransaction this needs no websocket (public RPCs rate-limit those).
 */
export async function confirmByPolling(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  intervalMs = 1_000,
): Promise<void> {
  for (let i = 0; ; i++) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error(`transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    // Check expiry only now and then, to keep the request count low.
    if (i % 10 === 9 && (await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      throw new Error(`transaction ${signature} expired before confirming`);
    }
    await sleep(intervalMs);
  }
}

/** Run `fn` over `items` with at most `limit` in flight (gentler on rate-limited RPCs). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** SPL token account amount (bytes 64..72), or 0 if the account doesn't exist. */
export function tokenAmountOf(data: Buffer | Uint8Array | undefined | null): bigint {
  if (!data || data.length < 72) return 0n;
  return Buffer.from(data).readBigUInt64LE(64);
}

export async function tokenBalance(connection: Connection, account: { toBase58(): string }): Promise<bigint> {
  try {
    const b = await connection.getTokenAccountBalance(account as never, "confirmed");
    return BigInt(b.value.amount);
  } catch {
    return 0n;
  }
}

export async function accountExists(connection: Connection, account: { toBase58(): string }): Promise<boolean> {
  return (await connection.getAccountInfo(account as never, "confirmed")) !== null;
}
