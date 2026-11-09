import { HOLO } from "./core/config.js";
import { spawnItem, findByType, findExplodable, removeItem, findItem } from "./items/registry.js";
import { clearAll, resetAll } from "./stage/scene.js";
import { addModel } from "./stage/models.js";
import { store } from "./core/store.js";
import { startGuide, stopGuide, placePiece } from "./items/model.js";

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
registerCommand("explode", () => { const h = findExplodable(); if (h) h.explodeTarget = HOLO.EXPLODE_OUT; });
registerCommand("assemble", () => { const h = findExplodable(); if (h) h.explodeTarget = 0.0; });
registerCommand("load_model", (c) => addModel(c.src, { title: c.title, x: c.x, y: c.y }));
registerCommand("guide", (c) => {
  const m = findExplodable();
  if (!m) return;
  if (c.on === false) stopGuide(m);
  else startGuide(m);
});
registerCommand("place_piece", (c) => {
  const m = findExplodable();
  if (m) placePiece(m, c.part === undefined ? "next" : c.part);
});
registerCommand("remove_model", (c) => {
  const it = c.id ? findItem(c.id) : store.items.find((m) => m.type === "model" && (!c.src || m.src === c.src));
  if (it) removeItem(it);
});
