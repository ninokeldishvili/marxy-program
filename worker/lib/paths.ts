// File locations for the worker's files (state, catalog, keys). They live in
// the worker folder, the working directory of `npm run worker|devnet:setup`;
// MARXY_WORKER_DIR points elsewhere.
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Paths are resolved at runtime (env overrides); tell the bundler not to trace them.
export const WORKER_DIR = resolve(/*turbopackIgnore: true*/ process.env.MARXY_WORKER_DIR ?? process.cwd());
export const KEYS_DIR = resolve(/*turbopackIgnore: true*/ WORKER_DIR, process.env.MARXY_KEYS_DIR ?? ".keys");
export const STATE_PATH = resolve(/*turbopackIgnore: true*/ WORKER_DIR, process.env.MARXY_STATE_PATH ?? "state.json");
export const CATALOG_PATH = join(WORKER_DIR, "catalog.json");

export function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

export function adminKeypairPath(): string {
  return resolve(/*turbopackIgnore: true*/ expandHome(process.env.ADMIN_KEYPAIR_PATH ?? "~/.config/solana/id.json"));
}

/**
 * The RPC endpoint. Tolerates the usual paste mistakes in host dashboards
 * (surrounding spaces or quotes); anything else that isn't an http(s) URL
 * fails with a message that names the variable but never echoes its value
 * (it may carry an API key).
 */
export function rpcUrl(): string {
  const name = process.env.RPC_URL?.trim() ? "RPC_URL" : process.env.NEXT_PUBLIC_RPC_URL?.trim() ? "NEXT_PUBLIC_RPC_URL" : null;
  if (!name) return "https://api.devnet.solana.com";
  const url = process.env[name]!.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`${name} must be a full URL starting with https:// (no quotes, no "${name}=" prefix)`);
  }
  return url;
}
