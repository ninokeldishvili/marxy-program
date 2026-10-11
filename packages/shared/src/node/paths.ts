// File locations for the worker's files (state, catalog, commands, keys). They
// live in the worker folder, the working directory of `npm run worker|devnet:setup`;
// MARXY_WORKER_DIR points elsewhere (e.g. `../worker` for the frontend's admin
// routes in local development).
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Paths are resolved at runtime (env overrides); tell the bundler not to trace them.
export const WORKER_DIR = resolve(/*turbopackIgnore: true*/ process.env.MARXY_WORKER_DIR ?? process.cwd());
export const KEYS_DIR = resolve(/*turbopackIgnore: true*/ WORKER_DIR, process.env.MARXY_KEYS_DIR ?? ".keys");
export const BOTS_DIR = join(KEYS_DIR, "bots");
export const STATE_PATH = resolve(/*turbopackIgnore: true*/ WORKER_DIR, process.env.MARXY_STATE_PATH ?? "state.json");
export const COMMANDS_DIR = join(WORKER_DIR, "commands");
export const CATALOG_PATH = join(WORKER_DIR, "catalog.json");

export function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

export function adminKeypairPath(): string {
  return resolve(/*turbopackIgnore: true*/ expandHome(process.env.ADMIN_KEYPAIR_PATH ?? "~/.config/solana/id.json"));
}

export function rpcUrl(): string {
  return process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
}
