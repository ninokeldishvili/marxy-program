// A tiny file queue: admin API routes drop commands, the worker picks them up.
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { COMMANDS_DIR } from "./paths";

export type WorkerCommand = { type: "create"; lotType: string };

export function enqueueCommand(cmd: WorkerCommand): string {
  mkdirSync(COMMANDS_DIR, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const tmp = join(COMMANDS_DIR, `.${name}.tmp`);
  writeFileSync(tmp, JSON.stringify(cmd));
  // rename = atomic publish
  renameSync(tmp, join(COMMANDS_DIR, name));
  return name;
}

/** Reads and removes every queued command, oldest first. */
export function takeCommands(): WorkerCommand[] {
  let files: string[];
  try {
    files = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".json") && !f.startsWith(".")).sort();
  } catch {
    return [];
  }
  const out: WorkerCommand[] = [];
  for (const f of files) {
    const path = join(COMMANDS_DIR, f);
    try {
      out.push(JSON.parse(readFileSync(path, "utf8")) as WorkerCommand);
    } catch {
      // ignore malformed files
    }
    rmSync(path, { force: true });
  }
  return out;
}
