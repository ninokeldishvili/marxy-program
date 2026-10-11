/**
 * One-time devnet setup (idempotent: running it again changes nothing).
 *
 *  1. Loads the admin keypair (ADMIN_KEYPAIR_PATH) and creates a treasury keypair in .keys/.
 *  2. Creates the mock USDC mint (6 decimals) and the Test BTC (8) / Test SOL (9) lot mints,
 *     all with the admin as mint authority. Mint keypairs live in .keys/mints/.
 *  3. Calls initialize_config(admin, treasury, mock USDC, 2,300 bps, GET_READY_SECS) if the config
 *     doesn't exist. GET_READY_SECS (env, default 300) is the get-ready period for new auctions.
 *  4. Writes every address to src/config/devnet.json and prints the env vars for .env.local.
 *
 * Usage (from app/):  npm run devnet:setup [-- --update-config]
 *   --update-config  if the config already exists with other values, align it with update_config
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { BN } from "@anchor-lang/core";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import type { LotTokenConfig, LotTokenKey, MarxyConfig } from "@marxy/shared/config";
import { initializeConfigIx } from "@marxy/shared/instructions";
import { configPda, getProgram } from "@marxy/shared/program";
import { MAX_GET_READY_SECS, MIN_GET_READY_SECS, PROGRAM_ID } from "@marxy/shared/idl";
import { MIN_MARGIN_BPS } from "@marxy/shared/pricing";
import { adminKeySource, loadAdmin, loadOrCreateKeypair } from "@marxy/shared/node/keys";
import { KEYS_DIR, rpcUrl } from "@marxy/shared/node/paths";
import { sendIxs } from "@marxy/shared/node/send";

/** The shared package's address file. Run from worker/ (`npm run devnet:setup`). */
const CONFIG_OUT_PATH = resolve(process.cwd(), process.env.MARXY_CONFIG_OUT ?? "../packages/shared/src/config/devnet.json");

const MINTS: { key: "usdc" | LotTokenKey; file: string; name: string; symbol: string; decimals: number }[] = [
  { key: "usdc", file: "usdc.json", name: "Mock USDC", symbol: "USDC", decimals: 6 },
  { key: "testBtc", file: "test-btc.json", name: "Test BTC", symbol: "tBTC", decimals: 8 },
  { key: "testSol", file: "test-sol.json", name: "Test SOL", symbol: "tSOL", decimals: 9 },
];

/** Get-ready period for new auctions: 5 minutes unless GET_READY_SECS says otherwise. */
function getReadySecs(): number {
  const secs = Number(process.env.GET_READY_SECS ?? 300);
  if (!Number.isInteger(secs) || secs < MIN_GET_READY_SECS || secs > MAX_GET_READY_SECS) {
    throw new Error(`GET_READY_SECS must be a whole number of seconds between ${MIN_GET_READY_SECS} and ${MAX_GET_READY_SECS}`);
  }
  return secs;
}

async function main() {
  const updateConfig = process.argv.includes("--update-config");
  const getReady = getReadySecs();
  const url = rpcUrl();
  const connection = new Connection(url, "confirmed");
  const admin = loadAdmin();
  console.log(`cluster:  ${new URL(url).host}`);
  console.log(`program:  ${PROGRAM_ID}`);
  console.log(`admin:    ${admin.publicKey.toBase58()} (${adminKeySource()})`);

  const programInfo = await connection.getAccountInfo(new PublicKey(PROGRAM_ID));
  if (!programInfo?.executable) {
    throw new Error(`program ${PROGRAM_ID} is not deployed on ${new URL(url).host}; run \`anchor deploy --provider.cluster devnet\` first`);
  }

  const balance = await connection.getBalance(admin.publicKey);
  console.log(`balance:  ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    throw new Error("the admin needs at least 0.1 SOL: `solana airdrop 2 --url devnet` or https://faucet.solana.com");
  }

  // 1. Treasury
  const treasury = loadOrCreateKeypair(join(KEYS_DIR, "treasury.json"));
  console.log(`treasury: ${treasury.keypair.publicKey.toBase58()}${treasury.created ? " (new keypair)" : ""}`);

  // 2. Mints
  const mints: Record<string, PublicKey> = {};
  for (const m of MINTS) {
    const { keypair } = loadOrCreateKeypair(join(KEYS_DIR, "mints", m.file));
    const exists = await connection.getAccountInfo(keypair.publicKey);
    if (exists) {
      console.log(`${m.name.padEnd(9)} ${keypair.publicKey.toBase58()} (exists)`);
    } else {
      await createMint(connection, admin, admin.publicKey, null, m.decimals, keypair, { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
      console.log(`${m.name.padEnd(9)} ${keypair.publicKey.toBase58()} (created)`);
    }
    mints[m.key] = keypair.publicKey;
  }

  // 3. Config
  const program = getProgram(connection);
  const config = await program.account.config.fetchNullable(configPda());
  if (!config) {
    const ix = await initializeConfigIx(program, {
      admin: admin.publicKey,
      treasury: treasury.keypair.publicKey,
      usdcMint: mints.usdc,
      minMarginBps: MIN_MARGIN_BPS,
      getReadySecs: getReady,
    });
    const sig = await sendIxs(connection, [ix], admin);
    console.log(`config:   initialized, get-ready ${getReady}s (${sig})`);
  } else {
    const mismatches = [
      !config.admin.equals(admin.publicKey) && `admin is ${config.admin.toBase58()}`,
      !config.treasury.equals(treasury.keypair.publicKey) && `treasury is ${config.treasury.toBase58()}`,
      !config.usdcMint.equals(mints.usdc) && `USDC mint is ${config.usdcMint.toBase58()}`,
      config.minMarginBps !== MIN_MARGIN_BPS && `minimum margin is ${config.minMarginBps} bps`,
      config.getReadySecs.toNumber() !== getReady && `get-ready period is ${config.getReadySecs}s`,
    ].filter(Boolean) as string[];
    if (mismatches.length === 0) {
      console.log("config:   exists and matches");
    } else if (!config.admin.equals(admin.publicKey)) {
      throw new Error(`the config belongs to another admin (${mismatches.join("; ")}); use that keypair as ADMIN_KEYPAIR_PATH`);
    } else if (updateConfig) {
      const ix = await program.methods
        .updateConfig(null, treasury.keypair.publicKey, mints.usdc, MIN_MARGIN_BPS, new BN(getReady))
        .accountsPartial({ admin: admin.publicKey, config: configPda() })
        .instruction();
      const sig = await sendIxs(connection, [ix], admin);
      console.log(`config:   updated (${sig})`);
    } else {
      throw new Error(`the config exists with other values (${mismatches.join("; ")}); re-run with --update-config to align it`);
    }
  }

  // 4. Addresses for the app
  const lotMints: Partial<Record<LotTokenKey, LotTokenConfig>> = {};
  for (const m of MINTS) {
    if (m.key === "usdc") continue;
    lotMints[m.key] = {
      mint: mints[m.key].toBase58(),
      name: m.name,
      symbol: m.symbol,
      decimals: m.decimals,
      tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    };
  }
  const out: MarxyConfig = {
    cluster: "devnet",
    programId: PROGRAM_ID,
    admin: admin.publicKey.toBase58(),
    treasury: treasury.keypair.publicKey.toBase58(),
    configPda: configPda().toBase58(),
    usdcMint: mints.usdc.toBase58(),
    usdcTokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    lotMints,
  };
  const json = `${JSON.stringify(out, null, 2)}\n`;
  if (existsSync(CONFIG_OUT_PATH) && readFileSync(CONFIG_OUT_PATH, "utf8") === json) {
    console.log(`addresses: ${CONFIG_OUT_PATH} (unchanged)`);
  } else {
    writeFileSync(CONFIG_OUT_PATH, json);
    console.log(`addresses: wrote ${CONFIG_OUT_PATH}`);
  }

  // Show what .env.local should contain, using the current values where they're set.
  const secretSet = Boolean(process.env.ADMIN_API_SECRET && !process.env.ADMIN_API_SECRET.startsWith("change-me"));
  console.log(`
Setup complete. worker/.env.local should contain (see .env.example):

RPC_URL=(${new URL(url).host})
ADMIN_KEYPAIR_PATH or ADMIN_KEYPAIR=(${adminKeySource()})
ADMIN_API_SECRET=${secretSet ? "(set)" : "<a long random string: openssl rand -hex 24>"}
GET_READY_SECS=${getReady}
SALES_MINUTES=${process.env.SALES_MINUTES ?? "30"}
`);
}

main().catch((e) => {
  console.error(`error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
