/**
 * Backend step "FUND": buy the lot and deposit it into the auction's lot vault.
 *
 *   mainnet:  Jupiter quote (USDC -> lot mint, ExactOut for the lot amount),
 *             swap from the admin wallet, then `fund_lot`.
 *   --mock:   skip Jupiter and mint the lot from a test mint the admin controls
 *             (devnet / localnet / demos), then `fund_lot`.
 *
 * Usage:
 *   yarn fund-lot --auction-id 1 --mock
 *   yarn fund-lot --auction-id 1 --yes [--slippage-bps 50] [--max-usdc 1000000000]
 *
 * Environment:
 *   RPC_URL          RPC endpoint (default: ANCHOR_PROVIDER_URL or devnet)
 *   ADMIN_KEYPAIR    admin keypair file (default: ~/.config/solana/id.json)
 *   JUP_API_URL      Jupiter Swap API base (default: https://lite-api.jup.ag/swap/v1)
 *   JUP_API_KEY      optional Jupiter API key (sent as x-api-key)
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseArgs } from "node:util";

import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import idl from "../target/idl/marxy.json";
import type { Marxy } from "../target/types/marxy.js";

const FUNDING_WINDOW_SECONDS = 15 * 60;

const { values: args } = parseArgs({
  options: {
    "auction-id": { type: "string" },
    mock: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    "slippage-bps": { type: "string", default: "50" },
    "max-usdc": { type: "string" },
  },
});

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function loadKeypair(path: string): Keypair {
  const resolved = path.startsWith("~") ? path.replace("~", homedir()) : path;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolved, "utf8"))));
}

async function tokenBalance(connection: Connection, account: PublicKey, programId: PublicKey) {
  try {
    return (await getAccount(connection, account, "confirmed", programId)).amount;
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return 0n;
    throw e;
  }
}

async function jupiter(path: string, init?: RequestInit): Promise<any> {
  const base = process.env.JUP_API_URL ?? "https://lite-api.jup.ag/swap/v1";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.JUP_API_KEY) headers["x-api-key"] = process.env.JUP_API_KEY;
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (!res.ok) fail(`Jupiter ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Swap USDC for exactly `amount` of `lotMint` into the admin's wallet. */
async function buyThroughJupiter(
  connection: Connection,
  admin: Keypair,
  usdcMint: PublicKey,
  lotMint: PublicKey,
  amount: bigint,
  maxUsdc: bigint,
) {
  const params = new URLSearchParams({
    inputMint: usdcMint.toBase58(),
    outputMint: lotMint.toBase58(),
    amount: amount.toString(),
    swapMode: "ExactOut",
    slippageBps: args["slippage-bps"]!,
  });
  const quote = await jupiter(`/quote?${params}`);
  // For ExactOut, otherAmountThreshold is the maximum USDC the swap may spend.
  const maxIn = BigInt(quote.otherAmountThreshold);
  console.log(`quote: ~${quote.inAmount} USDC (max ${maxIn}) for ${quote.outAmount} lot units`);
  if (maxIn > maxUsdc) fail(`quote max input ${maxIn} exceeds limit ${maxUsdc}`);

  const { swapTransaction, lastValidBlockHeight } = await jupiter("/swap", {
    method: "POST",
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: admin.publicKey.toBase58(),
      dynamicComputeUnitLimit: true,
      wrapAndUnwrapSol: true,
    }),
  });
  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([admin]);
  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const result = await connection.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) fail(`swap ${signature} failed: ${JSON.stringify(result.value.err)}`);
  console.log(`swap confirmed: ${signature}`);
}

/** Mock purchase: mint the lot from a test mint whose authority is the admin. */
async function mintMockLot(
  connection: Connection,
  admin: Keypair,
  lotMint: PublicKey,
  adminLotAta: PublicKey,
  amount: bigint,
  tokenProgram: PublicKey,
) {
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      admin.publicKey,
      adminLotAta,
      admin.publicKey,
      lotMint,
      tokenProgram,
    ),
    createMintToInstruction(lotMint, adminLotAta, admin.publicKey, amount, [], tokenProgram),
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [admin]);
  console.log(`mock lot minted: ${signature}`);
}

async function main() {
  if (!args["auction-id"]) fail("--auction-id is required");
  const auctionId = new BN(args["auction-id"]);

  const rpcUrl = process.env.RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const admin = loadKeypair(process.env.ADMIN_KEYPAIR ?? "~/.config/solana/id.json");
  const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" });
  const program = new Program<Marxy>(idl as Marxy, provider);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const [auctionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("auction"), auctionId.toArrayLike(Buffer, "le", 8)],
    program.programId,
  );
  const config = await program.account.config.fetch(configPda);
  const auction = await program.account.auction.fetch(auctionPda);

  if (!config.admin.equals(admin.publicKey)) fail(`signer ${admin.publicKey} is not the admin ${config.admin}`);
  if (!("active" in auction.status)) fail("auction is not active");
  if (auction.funded) fail("auction is already funded");
  const now = Math.floor(Date.now() / 1000);
  const start = auction.startTime.toNumber();
  if (now < start) fail(`auction starts at ${new Date(start * 1000).toISOString()}`);
  if (now > start + FUNDING_WINDOW_SECONDS) fail("funding window (15 min after start) has closed");
  if (auction.revenue.lt(auction.salesMinimum)) fail("sales minimum not met; settle into refunds instead");

  const lotMint = auction.lotMint;
  const mintInfo = await connection.getAccountInfo(lotMint);
  if (!mintInfo) fail(`lot mint ${lotMint} not found`);
  const lotTokenProgram = mintInfo.owner;
  await getMint(connection, lotMint, "confirmed", lotTokenProgram);

  const lotAmount = BigInt(auction.lotAmount.toString());
  const adminLotAta = getAssociatedTokenAddressSync(lotMint, admin.publicKey, false, lotTokenProgram);
  const held = await tokenBalance(connection, adminLotAta, lotTokenProgram);
  const needed = held >= lotAmount ? 0n : lotAmount - held;

  console.log(`cluster:     ${rpcUrl}`);
  console.log(`auction:     #${auctionId} ${auctionPda}`);
  console.log(`lot:         ${lotAmount} units of ${lotMint} (token program ${lotTokenProgram})`);
  console.log(`admin holds: ${held}, to buy: ${needed}`);

  if (needed > 0n) {
    if (args.mock) {
      await mintMockLot(connection, admin, lotMint, adminLotAta, needed, lotTokenProgram);
    } else {
      // Default spending cap: never pay more USDC than the credits sold.
      const maxUsdc = BigInt(args["max-usdc"] ?? auction.revenue.toString());
      if (!args.yes) {
        console.log(`would swap up to ${maxUsdc} USDC base units via Jupiter; re-run with --yes to execute`);
        return;
      }
      await buyThroughJupiter(connection, admin, auction.usdcMint, lotMint, needed, maxUsdc);
    }
    const after = await tokenBalance(connection, adminLotAta, lotTokenProgram);
    if (after < lotAmount) fail(`admin holds ${after} after purchase, need ${lotAmount}`);
  }

  const lotVault = getAssociatedTokenAddressSync(lotMint, auctionPda, true, lotTokenProgram);
  const signature = await program.methods
    .fundLot()
    .accountsPartial({
      admin: admin.publicKey,
      config: configPda,
      auction: auctionPda,
      lotMint,
      adminLotAccount: adminLotAta,
      lotVault,
      lotTokenProgram,
    })
    .rpc();
  console.log(`fund_lot confirmed: ${signature}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
