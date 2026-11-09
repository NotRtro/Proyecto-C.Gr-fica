import { store } from "../core/store.js";
import { settings } from "../core/settings.js";
import { serializeItem } from "../items/registry.js";
import { applyCmds } from "../commands.js";

let current = null;

function buildPayload() {
  const payload = {
    cursors: {}, items: [],
    ring: { state: store.ring.state, mood: store.ring.mood, wave: store.ring.wave, name: store.cfg.name },
    view: { wire: settings.wire, modelLook: settings.modelLook },
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
  } catch (e) { }
}

export function pushState() {
  if (!current) current = post(true).finally(() => { current = null; });
  return current;
}

export async function flushState() {
  while (current) await current;
  await post(false);
}

export async function loadConfig() {
  try { store.cfg = await fetch("/config").then((r) => r.json()); } catch (e) { }
}
