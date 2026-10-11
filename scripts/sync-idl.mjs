// Copies the Anchor build output (IDL + TS types) into the shared package.
// Run after every `anchor build` (in program/): `npm run sync-idl`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "program", "target");
const out = join(root, "packages", "shared", "src", "idl");
mkdirSync(out, { recursive: true });

for (const [from, to] of [
  [join(target, "idl", "marxy.json"), join(out, "marxy.json")],
  [join(target, "types", "marxy.ts"), join(out, "marxy.ts")],
]) {
  if (!existsSync(from)) {
    console.error(`missing ${from}: run \`anchor build\` in program/ first`);
    process.exit(1);
  }
  copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}

const idl = (await import(join(out, "marxy.json"), { with: { type: "json" } })).default;
console.log(`program ${idl.address}`);
