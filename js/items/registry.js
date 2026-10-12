// Registro de tipos de item. Cada tipo se describe una vez y el resto del sistema
// (loop del tracker, hit test, pushState, render page) lo usa sin conocerlo.
//
// registerItemType(type, {
//   build(def)            -> { el, ...extras }  DOM compartido tracker/render page
//   init(item, def)       opcional: campos propios en el tracker
//   update(item, dt, now) opcional: cada frame en el tracker
//   sync(ri, def, env)    opcional: cada frame en la render page (env = {now, ring})
//   onTap(item)           opcional: reaccion a un tap
//   dispose(item)         opcional: liberar recursos (WebGL, video...)
//   grabbable             default true: se puede agarrar con pinch
//   rotatable             default false: dos manos / Shift+rueda cambian item.ry
//   explodable            default false: responde a explode (comando o pinch en vacio + arrastre)
//   keepOnClear           default false: sobrevive al comando "clear"
//   defaultPos            {x, y} en fraccion de pantalla
//   defaultTitle
// })
//
// Los extras que devuelve build() quedan en item.view (p. ej. item.view.ctx).
import { store, nextId } from "../core/store.js";
import { emit } from "../core/bus.js";

const TYPES = new Map();

export function registerItemType(type, def) {
  TYPES.set(type, {
    grabbable: true, rotatable: false, explodable: false, keepOnClear: false,
    defaultPos: { x: 0.5, y: 0.5 }, ...def,
  });
}

export function getItemType(type) { return TYPES.get(type); }

export function stageLayer() { return document.getElementById("behind"); }

// Solo traslacion y escala en CSS. La rotacion de modelos 3D ocurre dentro de su
// escena three.js (docs/06), nunca como rotate CSS.
export function applyTransform(obj) {
  obj.el.style.position = "absolute";
  obj.el.style.left = "0"; obj.el.style.top = "0";
  obj.el.style.transform =
    "translate(-50%,-50%) translate(" + obj.x + "px," + obj.y + "px) scale(" + obj.scale + ")";
}

export function spawnItem(type, def = {}) {
  const T = TYPES.get(type);
  if (!T) throw new Error("tipo de item desconocido: " + type);
  const view = T.build(def);
  stageLayer().appendChild(view.el);
  const item = {
    id: def.id || nextId(), type, el: view.el, view,
    title: def.title || T.defaultTitle || "",
    x: (def.x ?? T.defaultPos.x) * innerWidth, y: (def.y ?? T.defaultPos.y) * innerHeight,
    scale: 1, rx: 0, ry: 0, rz: 0,
  };
  if (T.init) T.init(item, def);
  store.items.push(item);
  if (T.explodable) store.activeId = item.id;
  applyTransform(item);
  emit("item:added", item);
  return item;
}

export function removeItem(item) {
  const idx = store.items.indexOf(item);
  if (idx === -1) return;
  store.items.splice(idx, 1);
  const T = TYPES.get(item.type);
  if (T && T.dispose) T.dispose(item);
  item.el.remove();
  emit("item:removed", item);
}

export function findItem(id) { return store.items.find((it) => it.id === id); }
export function findByType(type) { return store.items.find((it) => it.type === type); }

function typeFlag(item, flag) {
  const T = TYPES.get(item.type);
  return !!T && !!T[flag];
}
export function isGrabbable(item) { return typeFlag(item, "grabbable"); }
export function isRotatable(item) { return typeFlag(item, "rotatable"); }
// El modelo sobre el que actuan Herramientas y el explode: el ultimo tocado o
// agregado (store.activeId) o, si ya no existe, el primero explotable.
export function findExplodable() {
  const active = store.items.find((it) => it.id === store.activeId && typeFlag(it, "explodable"));
  return active || store.items.find((it) => typeFlag(it, "explodable"));
}

export function keepsOnClear(item) {
  const T = TYPES.get(item.type);
  return !!T && T.keepOnClear;
}

// Formato de cable de /state (docs/07): coordenadas en fraccion de pantalla.
// g = 1 si alguna mano lo tiene agarrado (lo lee bin/board-state.sh).
export function serializeItem(it) {
  return {
    id: it.id, type: it.type, title: it.title || "", body: it.body || "", src: it.src || "",
    x: it.x / innerWidth, y: it.y / innerHeight, scale: it.scale || 1,
    rx: it.rx || 0, ry: it.ry || 0, rz: it.rz || 0,
    explode: it.explode || 0, dissolve: it.dissolve || 0,
    g: it.grabbed ? 1 : 0,
  };
}
