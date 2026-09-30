// Conecta la tuberia de gestos (pura) con la escena real del navegador.
// Este adapter es lo unico que el arbitro sabe del DOM.
import { store } from "../core/store.js";
import { emit } from "../core/bus.js";
import {
  applyTransform, findItem, getItemType, isGrabbable, isRotatable, findExplodable,
} from "../items/registry.js";
import { createInputPipeline } from "../input/pipeline.js";

const adapter = {
  hitTest(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      const item = store.items.find((it) => isGrabbable(it) && (it.el === el || it.el.contains(el)));
      if (item) return item;
    }
    return null;
  },
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
