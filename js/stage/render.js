// Render page (?role=render) para OBS: sin camara ni MediaPipe. Lee /state cada
// frame y reconstruye la escena localmente con fondo transparente.
import { HIDE_CURSORS, RFLIP } from "../core/env.js";
import { FOLLOW_LERP } from "../core/config.js";
import { getItemType, stageLayer, applyTransform } from "../items/registry.js";

const DEFAULT_RING = { state: "idle", mood: "green", wave: [], name: "Assistant" };

const renderItems = {};
const renderCursors = {};

// Ley de espejo: el tracker ve self-view espejado; la audiencia no.
function rxFrac(f) { return RFLIP ? 1 - f : f; }

// Tipos desconocidos caen al anillo, igual que antes de la fase 3.
function typeFor(type) { return getItemType(type) || getItemType("widget"); }

function createRenderItem(def) {
  const view = typeFor(def.type).build(def);
  stageLayer().appendChild(view.el);
  return {
    id: def.id, type: def.type, el: view.el, view,
    x: rxFrac(def.x || 0) * innerWidth, y: (def.y || 0) * innerHeight, scale: 1,
    ry: 0, explode: 0, dissolve: 0,
  };
}

function reconcileItems(list, ring) {
  const env = { now: performance.now(), ring };
  const seen = new Set();
  for (const def of list) {
    seen.add(def.id);
    let ri = renderItems[def.id];
    if (!ri) ri = renderItems[def.id] = createRenderItem(def);
    const tx = rxFrac(def.x || 0) * innerWidth, ty = (def.y || 0) * innerHeight;
    ri.x += (tx - ri.x) * FOLLOW_LERP;
    ri.y += (ty - ri.y) * FOLLOW_LERP;
    ri.scale += ((def.scale || 1) - ri.scale) * FOLLOW_LERP;
    applyTransform(ri);
    const T = typeFor(ri.type);
    if (T.sync) T.sync(ri, def, env);
  }
  for (const id of Object.keys(renderItems)) {
    if (!seen.has(id)) {
      const ri = renderItems[id];
      const T = typeFor(ri.type);
      if (T.dispose) T.dispose(ri);
      ri.el.remove();
      delete renderItems[id];
    }
  }
}

function reconcileCursors(defs) {
  const seen = new Set();
  for (const [label, def] of Object.entries(defs)) {
    seen.add(label);
    let rc = renderCursors[label];
    if (!rc) {
      const el = document.createElement("div");
      el.className = "cursor";
      stageLayer().appendChild(el);
      rc = renderCursors[label] = { el, x: 0, y: 0 };
    }
    const tx = rxFrac(def.x || 0) * innerWidth, ty = (def.y || 0) * innerHeight;
    rc.x += (tx - rc.x) * FOLLOW_LERP;
    rc.y += (ty - rc.y) * FOLLOW_LERP;
    rc.el.style.transform = "translate(-50%,-50%) translate(" + rc.x + "px," + rc.y + "px)";
    rc.el.classList.toggle("pinched", !!def.p);
  }
  for (const label of Object.keys(renderCursors)) {
    if (!seen.has(label)) { renderCursors[label].el.remove(); delete renderCursors[label]; }
  }
}

async function renderLoop() {
  try {
    const st = await fetch("/state", { cache: "no-store" }).then((r) => r.json());
    reconcileItems(st.items || [], st.ring || DEFAULT_RING);
    if (!HIDE_CURSORS) reconcileCursors(st.cursors || {});
  } catch (e) { /* servidor no disponible; se reintenta el siguiente frame */ }
  requestAnimationFrame(renderLoop);
}

export function bootRender() {
  document.body.classList.add("render");
  requestAnimationFrame(renderLoop);
}
