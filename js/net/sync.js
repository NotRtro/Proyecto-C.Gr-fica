// Comunicacion con server.py: publica el estado de la escena y recibe comandos.
import { store } from "../core/store.js";
import { serializeItem } from "../items/registry.js";
import { applyCmds } from "../commands.js";

let inFlight = false;

// Cursores en el cable: una entrada por mano fisica (el mouse no se publica).
// La clave es el ID estable de la mano (h1, h2...); h = lateralidad votada.
export async function pushState() {
  if (inFlight) return; // si el servidor tarda, no se apilan requests
  inFlight = true;
  const payload = {
    cursors: {}, items: [],
    ring: { state: store.ring.state, mood: store.ring.mood, wave: store.ring.wave, name: store.cfg.name },
  };
  for (const h of store.hands) {
    if (h.source !== "hand" || !h.present) continue;
    payload.cursors[h.id] = { x: h.x / innerWidth, y: h.y / innerHeight, p: h.pinched ? 1 : 0, d: 0, h: h.handedness };
  }
  for (const it of store.items) payload.items.push(serializeItem(it));
  try {
    const res = await fetch("/state", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data && data.cmds) applyCmds(data.cmds);
  } catch (e) { /* servidor no disponible; se reintenta en la proxima publicacion */ }
  finally { inFlight = false; }
}

export async function pollRing() {
  try { store.ring = await fetch("/orb", { cache: "no-store" }).then((r) => r.json()); }
  catch (e) { /* se reintenta en el proximo poll */ }
}

export async function loadConfig() {
  try { store.cfg = await fetch("/config").then((r) => r.json()); } catch (e) { /* usa defaults */ }
}
