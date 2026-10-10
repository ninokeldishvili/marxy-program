// File locations, relative to the app folder (the working directory of
// `npm run dev|worker|devnet:setup|smoke`).
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Paths are resolved at runtime (env overrides); tell the bundler not to trace them.
export const APP_ROOT = resolve(/*turbopackIgnore: true*/ process.env.MARXY_APP_ROOT ?? process.cwd());
export const KEYS_DIR = resolve(/*turbopackIgnore: true*/ APP_ROOT, process.env.MARXY_KEYS_DIR ?? ".keys");
export const BOTS_DIR = join(KEYS_DIR, "bots");
export const WORKER_DIR = join(APP_ROOT, "worker");
export const STATE_PATH = resolve(/*turbopackIgnore: true*/ APP_ROOT, process.env.MARXY_STATE_PATH ?? "worker/state.json");
export const COMMANDS_DIR = join(WORKER_DIR, "commands");
export const CATALOG_PATH = join(WORKER_DIR, "catalog.json");
export const CONFIG_OUT_PATH = join(APP_ROOT, "src", "config", "devnet.json");

export function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

export function adminKeypairPath(): string {
  return resolve(/*turbopackIgnore: true*/ expandHome(process.env.ADMIN_KEYPAIR_PATH ?? "~/.config/solana/id.json"));
}

export function rpcUrl(): string {
  return process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
}
