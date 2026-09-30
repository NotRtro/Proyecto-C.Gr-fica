// Operaciones de escena del tracker: poblar al arrancar, limpiar, reiniciar.
import { store } from "../core/store.js";
import { spawnItem, removeItem, keepsOnClear } from "../items/registry.js";
import { input } from "./interaction.js";

// La escena arranca solo con el reactor. El anillo del asistente ("widget") se
// quito de HeyTECHI; el tipo sigue registrado para la render page y el protocolo.
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
