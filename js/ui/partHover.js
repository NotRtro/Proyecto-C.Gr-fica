import { store } from "../core/store.js";
import { pickAt } from "../stage/interaction.js";
import { piecesActive, pieceLabel } from "../items/model.js";
import { updatePieceInfoHold, cancelPieceInfoHold } from "./pieceInfo.js";

const labels = new Map();

function showLabel(hand, text) {
  const label = labelFor(hand.id);
  label.textContent = text;
  label.style.transform = "translate(" + Math.round(hand.x + 22) + "px," + Math.round(hand.y - 34) + "px)";
}

function draggedPiece(handId) {
  for (const item of store.items) {
    if (item.type !== "model" || !item.view.drags) continue;
    const drag = item.view.drags.get(handId);
    if (drag) return { item, part: drag.i };
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

function updatePinchedHand(hand, now) {
  const dragged = draggedPiece(hand.id);
  if (!dragged) {
    cancelPieceInfoHold(hand.id);
    return false;
  }
  showLabel(hand, pieceLabel(dragged.item, dragged.part, store.showHud));
  updatePieceInfoHold(hand, dragged.item, dragged.part, now);
  return true;
}

function updateHover(hand, hovered) {
  const hit = pickAt(hand.ax, hand.ay);
  if (!hit || hit.part < 0 || !piecesActive(hit.item)) return false;
  if (!hovered.has(hit.item)) hovered.set(hit.item, hit.part);
  showLabel(hand, pieceLabel(hit.item, hit.part, store.showHud));
  return true;
}

function clearHiddenLabels(visibleHands) {
  for (const [handId, label] of labels) {
    if (visibleHands.has(handId)) continue;
    label.remove();
    labels.delete(handId);
    cancelPieceInfoHold(handId);
  }
}

export function updatePartHover(hands, { locked = false, now = performance.now() } = {}) {
  const hovered = new Map();
  const visibleHands = new Set();
  for (const hand of hands) {
    if (locked || !hand.present || hand.removed) continue;
    const visible = hand.pinched
      ? updatePinchedHand(hand, now)
      : updateHover(hand, hovered);
    if (!hand.pinched) cancelPieceInfoHold(hand.id);
    if (visible) visibleHands.add(hand.id);
  }
  for (const item of store.items) {
    if (item.type === "model") item.hoverPart = hovered.get(item) ?? -1;
  }
  clearHiddenLabels(visibleHands);
}
