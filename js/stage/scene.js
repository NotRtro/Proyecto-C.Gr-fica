import { store } from "../core/store.js";
import { spawnItem, removeItem, keepsOnClear } from "../items/registry.js";
import { input } from "./interaction.js";

export function spawnStage() {
  spawnItem("holo", {});
}

export function clearAll() {
  input.arbiter.releaseAll();
  for (const it of [...store.items]) {
    if (!keepsOnClear(it)) removeItem(it);
  }
}

export function resetAll() {
  clearAll();
  spawnItem("holo", {});
}
