// Pieza apuntada (fase 7, paso 7A): con un modelo desarmado, la pieza bajo cada
// mano (o el mouse) se resalta (item.hoverPart, lo dibuja js/items/model.js) y
// junto al cursor aparece una etiqueta con su nombre. Mientras una mano arrastra
// una pieza (7C) la etiqueta la acompana. Con el panel de depuracion (tecla H) la
// etiqueta agrega los numeros de pieza automaticos, para escribir el manifest.
//
// Las etiquetas viven en la capa de cursores (pointer-events: none), asi nunca
// tapan la escena para el hit test.
import { store } from "../core/store.js";
import { pickAt } from "../stage/interaction.js";
import { piecesActive, pieceLabel } from "../items/model.js";

const labels = new Map(); // id de mano -> elemento

function showLabel(h, text) {
  const el = labelFor(h.id);
  el.textContent = text;
  el.style.transform = "translate(" + Math.round(h.x + 22) + "px," + Math.round(h.y - 34) + "px)";
}

// Pieza que esta arrastrando la mano `id` (si alguna): { item, part }.
function draggedBy(id) {
  for (const it of store.items) {
    if (it.type !== "model" || !it.view.drags) continue;
    const d = it.view.drags.get(id);
    if (d) return { item: it, part: d.i };
  }
  return null;
}

function labelFor(id) {
  let el = labels.get(id);
  if (!el) {
    el = document.createElement("div");
    el.className = "part-label";
    document.getElementById("cursors").appendChild(el);
    labels.set(id, el);
  }
  return el;
}

export function updatePartHover(hands, { locked = false } = {}) {
  const hovered = new Map(); // item -> pieza
  const shown = new Set();
  for (const h of hands) {
    if (locked || !h.present || h.removed) continue;
    if (h.pinched) {
      const d = draggedBy(h.id);
      if (d) { showLabel(h, pieceLabel(d.item, d.part, store.showHud)); shown.add(h.id); }
      continue;
    }
    const hit = pickAt(h.ax, h.ay);
    if (!hit || hit.part < 0 || !piecesActive(hit.item)) continue;
    if (!hovered.has(hit.item)) hovered.set(hit.item, hit.part);
    showLabel(h, pieceLabel(hit.item, hit.part, store.showHud));
    shown.add(h.id);
  }
  for (const it of store.items) {
    if (it.type === "model") it.hoverPart = hovered.has(it) ? hovered.get(it) : -1;
  }
  for (const [id, el] of labels) {
    if (!shown.has(id)) { el.remove(); labels.delete(id); }
  }
}
