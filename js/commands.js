// Registro de comandos del protocolo /cmd (docs/07). El servidor valida la accion
// contra su allowlist (_ALLOWED en server.py); aqui se define que hace cada una.
// Acciones permitidas por el servidor pero sin handler se ignoran (console.debug).
import { HOLO } from "./core/config.js";
import { spawnItem, findByType } from "./items/registry.js";
import { clearAll, resetAll } from "./stage/scene.js";

const COMMANDS = new Map();

export function registerCommand(name, fn) { COMMANDS.set(name, fn); }

export function applyCmds(cmds) {
  for (const c of cmds || []) {
    const fn = COMMANDS.get(c.a);
    if (!fn) { console.debug("[barehands] comando sin manejar todavia:", c.a, c); continue; }
    try { fn(c); } catch (e) { console.error("[barehands] fallo el comando", c.a, e); }
  }
}

registerCommand("add_card", (c) => spawnItem("card", { title: c.title, body: c.body, x: c.x, y: c.y }));
registerCommand("add_img", (c) => spawnItem("img", { src: c.src, title: c.title, x: c.x, y: c.y }));
registerCommand("clear", () => clearAll());
registerCommand("reset", () => resetAll());
registerCommand("hand", (c) => {
  if (!findByType("holo")) spawnItem("holo", { title: c.title, x: c.x, y: c.y });
});
registerCommand("explode", () => { const h = findByType("holo"); if (h) h.explodeTarget = HOLO.EXPLODE_OUT; });
registerCommand("assemble", () => { const h = findByType("holo"); if (h) h.explodeTarget = 0.0; });
