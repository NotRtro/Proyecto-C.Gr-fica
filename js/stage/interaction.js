// Conecta la tuberia de gestos (pura) con la escena real del navegador.
// Este adapter es lo unico que el arbitro sabe del DOM.
//
// Todo elemento de interfaz que deba "tapar" la escena lleva el atributo
// data-ui (menu, pestana del menu, tarjeta del tutorial): un pinch encima nunca
// agarra ni explota lo que hay detras.
import { store } from "../core/store.js";
import { emit } from "../core/bus.js";
import {
  applyTransform, findItem, getItemType, isGrabbable, isRotatable, findExplodable,
} from "../items/registry.js";
import { createInputPipeline } from "../input/pipeline.js";

function uiElementAt(x, y) {
  const top = document.elementFromPoint(x, y);
  return top ? top.closest("[data-ui]") : null;
}

function itemAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest("[data-ui]")) return null; // la interfaz esta encima
    const item = store.items.find((it) => isGrabbable(it) && (it.el === el || it.el.contains(el)));
    if (item) return item;
  }
  return null;
}

const adapter = {
  hitTest: itemAt,
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

// Que hay bajo un punto, para el estado visual del cursor: "ui" | "item" | null.
export function hoverKindAt(x, y) {
  if (uiElementAt(x, y)) return "ui";
  return itemAt(x, y) ? "item" : null;
}
