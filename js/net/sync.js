// Comunicacion con server.py: publica el estado de la escena y recibe comandos.
import { store } from "../core/store.js";
import { serializeItem } from "../items/registry.js";
import { applyCmds } from "../commands.js";

export async function pushState() {
  const payload = {
    cursors: {}, items: [],
    ring: { state: store.ring.state, mood: store.ring.mood, wave: store.ring.wave, name: store.cfg.name },
  };
  for (const [label, c] of Object.entries(store.cursors)) {
    payload.cursors[label] = { x: c.x / innerWidth, y: c.y / innerHeight, p: c.pinched ? 1 : 0, d: 0 };
  }
  for (const it of store.items) payload.items.push(serializeItem(it));
  try {
    const res = await fetch("/state", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data && data.cmds) applyCmds(data.cmds);
  } catch (e) { /* servidor no disponible; se reintenta el siguiente frame */ }
}

export async function pollRing() {
  try { store.ring = await fetch("/orb", { cache: "no-store" }).then((r) => r.json()); }
  catch (e) { /* se reintenta en el proximo poll */ }
}

export async function loadConfig() {
  try { store.cfg = await fetch("/config").then((r) => r.json()); } catch (e) { /* usa defaults */ }
}
