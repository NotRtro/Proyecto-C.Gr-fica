import { store } from "../core/store.js";
import { pickAt } from "../stage/interaction.js";
import { piecesActive, pieceLabel } from "../items/model.js";

const labels = new Map();

function showLabel(h, text) {
  const el = labelFor(h.id);
  el.textContent = text;
  el.style.transform = "translate(" + Math.round(h.x + 22) + "px," + Math.round(h.y - 34) + "px)";
}

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
  const hovered = new Map();
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
