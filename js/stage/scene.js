// Operaciones de escena del tracker: poblar al arrancar, limpiar, reiniciar.
import { store } from "../core/store.js";
import { spawnItem, removeItem, findByType, keepsOnClear, applyTransform } from "../items/registry.js";
import { input } from "./interaction.js";

export function spawnStage() {
  spawnItem("widget", { id: "ring" });
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
  const ring = findByType("widget");
  if (ring) { ring.x = innerWidth / 2; ring.y = innerHeight / 2; applyTransform(ring); }
  spawnItem("holo", {});
}
