// Keypair files (Solana CLI JSON format). Server / scripts only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Keypair } from "@solana/web3.js";

import { adminKeypairPath } from "./paths";

export function loadKeypair(path: string): Keypair {
  const bytes = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

/** Loads the keypair at `path`, creating (and saving) a new one if the file doesn't exist. */
export function loadOrCreateKeypair(path: string): { keypair: Keypair; created: boolean } {
  if (existsSync(path)) return { keypair: loadKeypair(path), created: false };
  const keypair = Keypair.generate();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return { keypair, created: true };
}

let cachedAdmin: Keypair | null = null;

export function loadAdmin(): Keypair {
  if (!cachedAdmin) {
    const path = adminKeypairPath();
    if (!existsSync(path)) throw new Error(`admin keypair not found at ${path} (set ADMIN_KEYPAIR_PATH)`);
    cachedAdmin = loadKeypair(path);
  }
  return cachedAdmin;
}
