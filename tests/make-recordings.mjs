import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios } from "./synthetic.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "recordings");
mkdirSync(dir, { recursive: true });
for (const [name, rec] of Object.entries(scenarios())) {
  writeFileSync(join(dir, name + ".json"), JSON.stringify(rec));
  console.log("escrito", name + ".json", "(" + rec.frames.length + " frames)");
}
