// Conecta la tuberia de gestos (pura) con la escena real del navegador.
// Este adapter es lo unico que el arbitro sabe del DOM.
//
// Todo elemento de interfaz que deba "tapar" la escena lleva el atributo
// data-ui (menu, pestana del menu, tarjeta del tutorial): un pinch encima nunca
// agarra ni explota lo que hay detras.
import { store } from "../core/store.js";
import { emit, on } from "../core/bus.js";
import {
  applyTransform, findItem, getItemType, isGrabbable, isRotatable, findExplodable,
} from "../items/registry.js";
import { createInputPipeline } from "../input/pipeline.js";

function uiElementAt(x, y) {
  const top = document.elementFromPoint(x, y);
  return top ? top.closest("[data-ui]") : null;
}

// Item bajo el punto y, si el tipo lo sabe (modelos 3D), la pieza: { item, part }.
// Los tipos con pick() se tocan por su silueta: si el punto cae en una zona
// transparente se sigue buscando lo que hay detras.
function pickAt(x, y) {
  const tried = new Set();
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest("[data-ui]")) return null; // la interfaz esta encima
    const item = store.items.find((it) => isGrabbable(it) && (it.el === el || it.el.contains(el)));
    if (!item || tried.has(item)) continue;
    tried.add(item);
    const T = getItemType(item.type);
    if (!T.pick) return { item, part: -1 };
    const hit = T.pick(item, x, y);
    if (hit) return { item, part: hit.part };
  }
  return null;
}

function itemAt(x, y) {
  const hit = pickAt(x, y);
  return hit ? hit.item : null;
}

// Pieza de un modelo desarmado que se puede tomar en (x, y) (fase 7C).
function pieceAt(x, y) {
  const hit = pickAt(x, y);
  if (!hit || hit.part < 0) return null;
  const T = getItemType(hit.item.type);
  return T.pieceFree && T.pieceFree(hit.item, hit.part) ? hit : null;
}

const typeOf = (item) => getItemType(item.type);

const adapter = {
  hitTest: itemAt,
  pieceAt,
  beginPiece: (item, part, hand, x, y) => typeOf(item).pieceBegin(item, part, hand, x, y),
  movePiece: (item, hand, x, y) => typeOf(item).pieceMove(item, hand, x, y),
  endPiece: (item, hand) => typeOf(item).pieceEnd(item, hand),
  isUiAt: (x, y) => !!uiElementAt(x, y),
  findItem,
  findExplodable,
  canRotate: isRotatable,
  onMoved: applyTransform,
  onGrab(item, on) {
    item.grabbed = on;
    item.el.classList.toggle("grabbed", on);
  },
  onTap(item) {
    const T = getItemType(item.type);
    if (T && T.onTap) T.onTap(item);
  },
  emit,
};

export const input = createInputPipeline(adapter);

export { pickAt };

// Que hay bajo un punto, para el estado visual del cursor: "ui" | "item" | null.
export function hoverKindAt(x, y) {
  if (uiElementAt(x, y)) return "ui";
  return itemAt(x, y) ? "item" : null;
}

// El ultimo modelo agarrado pasa a ser el "activo" (Herramientas, explode).
on("grab:start", ({ item }) => { if (item) store.activeId = item.id; });
on("twohand:start", ({ item }) => { if (item) store.activeId = item.id; });
on("piece:grab", ({ item }) => { if (item) store.activeId = item.id; });
