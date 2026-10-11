/**
 * Read-only RPC consistency check: reads the auction list 20 times and fails if
 * a read ever returns fewer auctions than an earlier one (a load-balanced
 * backend serving stale account data).
 *
 * Usage:  npm run rpc-check [-- <rpc url>]   (default: RPC_URL from worker/.env.local)
 */
import { Connection } from "@solana/web3.js";

import { fetchAllAuctions, getProgram } from "@marxy/shared/program";
import { rpcUrl } from "../lib/paths";

const READS = 20;

async function main() {
  const url = process.argv[2] ?? rpcUrl();
  // Host only: the URL may carry an API key.
  console.log(`checking ${new URL(url).host} (${READS} reads)`);
  const program = getProgram(new Connection(url, "confirmed"));
  const counts: number[] = [];
  for (let i = 0; i < READS; i++) {
    const started = Date.now();
    try {
      counts.push((await fetchAllAuctions(program)).length);
      console.log(`  ${i + 1}: ${counts.at(-1)} auctions, ${Date.now() - started} ms`);
    } catch (e) {
      console.log(`  ${i + 1}: error ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  const max = Math.max(...counts);
  const stale = counts.filter((c) => c < max).length;
  const failed = READS - counts.length;
  if (stale === 0 && failed === 0) {
    console.log(`OK: every read returned ${max} auctions`);
  } else {
    console.log(`FAIL: ${stale} stale read(s) (fewer than ${max} auctions), ${failed} failed read(s)`);
    process.exit(1);
  }
}

main();
