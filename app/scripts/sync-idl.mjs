// Copies the Anchor build output (IDL + TS types) into the app.
// Run after every `anchor build`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(app, "..", "target");
const out = join(app, "src", "idl");
mkdirSync(out, { recursive: true });

for (const [from, to] of [
  [join(target, "idl", "marxy.json"), join(out, "marxy.json")],
  [join(target, "types", "marxy.ts"), join(out, "marxy.ts")],
]) {
  if (!existsSync(from)) {
    console.error(`missing ${from}: run \`anchor build\` in the repo root first`);
    process.exit(1);
  }
  copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}

const idl = (await import(join(out, "marxy.json"), { with: { type: "json" } })).default;
console.log(`program ${idl.address}`);
