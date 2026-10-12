// Comunicacion con server.py: publica el estado de la escena y recibe comandos.
import { store } from "../core/store.js";
import { settings } from "../core/settings.js";
import { serializeItem } from "../items/registry.js";
import { applyCmds } from "../commands.js";

let current = null; // publicacion en curso (si el servidor tarda, no se apilan requests)

// Cursores en el cable: una entrada por mano fisica (el mouse no se publica).
// La clave es el ID estable de la mano (h1, h2...); h = lateralidad votada.
// view: preferencias visuales que la render page (OBS) debe replicar.
function buildPayload() {
  const payload = {
    cursors: {}, items: [],
    ring: { state: store.ring.state, mood: store.ring.mood, wave: store.ring.wave, name: store.cfg.name },
    view: { wire: settings.wire, modelMode: settings.modelMode },
  };
  for (const h of store.hands) {
    if (h.source !== "hand" || !h.present) continue;
    payload.cursors[h.id] = { x: h.x / innerWidth, y: h.y / innerHeight, p: h.pinched ? 1 : 0, d: 0, h: h.handedness };
  }
  for (const it of store.items) payload.items.push(serializeItem(it));
  return payload;
}

async function post(withCmds) {
  try {
    const res = await fetch("/state", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload()),
    });
    const data = await res.json();
    if (withCmds && data && data.cmds) applyCmds(data.cmds);
  } catch (e) { /* servidor no disponible; se reintenta en la proxima publicacion */ }
}

export function pushState() {
  if (!current) current = post(true).finally(() => { current = null; });
  return current;
}

// Publicacion final (al salir): espera la que este en curso y publica el estado
// actual sin aplicar comandos nuevos. Asi OBS no se queda con la ultima escena.
export async function flushState() {
  while (current) await current;
  await post(false);
}

export async function loadConfig() {
  try { store.cfg = await fetch("/config").then((r) => r.json()); } catch (e) { /* usa defaults */ }
}
