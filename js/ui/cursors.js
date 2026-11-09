import { PINCH_FEEDBACK } from "../core/config.js";

const els = new Map();

function layer() { return document.getElementById("cursors"); }

export function renderCursors(states, opts) {
  const seen = new Set();
  for (const h of states) {
    if (h.source !== "hand" || h.removed) continue;
    seen.add(h.id);
    let el = els.get(h.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "cursor";
      layer().appendChild(el);
      els.set(h.id, el);
    }
    const kind = h.present ? opts.kindAt(h.ax, h.ay) : null;
    const p = h.present ? opts.progressOf(h) : 0;
    const d = opts.displayOf ? opts.displayOf(h) : h;
    el.style.transform = "translate(-50%,-50%) translate(" + d.x + "px," + d.y + "px)";
    el.classList.toggle("pinched", h.pinched);
    el.classList.toggle("lost", !h.present);
    el.classList.toggle("hover-item", kind === "item");
    el.classList.toggle("hover-ui", kind === "ui");
    el.classList.toggle("progress", p > 0.02);
    el.classList.toggle("dial", !!(h.palm && h.palm.pose === "dial"));
    const s = h.present && !h.pinched ? h.pinchStrength || 0 : 0;
    el.classList.toggle("near-pinch", s > PINCH_FEEDBACK.SHOW_FROM);
    el.style.setProperty("--s", s.toFixed(3));
    el.style.setProperty("--p", p.toFixed(3));
  }
  for (const [id, el] of els) {
    if (!seen.has(id)) { el.remove(); els.delete(id); }
  }
}

export function pulseCursor(hand) {
  const el = els.get(hand);
  if (!el) return;
  el.classList.remove("confirm");
  void el.offsetWidth;
  el.classList.add("confirm");
  setTimeout(() => el.classList.remove("confirm"), 320);
}
