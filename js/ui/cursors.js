// Dibuja un cursor por mano detectada. El mouse no se dibuja (ya tiene el
// puntero del sistema). Una mano perdida por un instante se ve atenuada.
import { stageLayer } from "../items/registry.js";

const els = new Map();

export function renderCursors(states) {
  const seen = new Set();
  for (const h of states) {
    if (h.source !== "hand" || h.removed) continue;
    seen.add(h.id);
    let el = els.get(h.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "cursor";
      stageLayer().appendChild(el);
      els.set(h.id, el);
    }
    el.style.transform = "translate(-50%,-50%) translate(" + h.x + "px," + h.y + "px)";
    el.classList.toggle("pinched", h.pinched);
    el.classList.toggle("lost", !h.present);
  }
  for (const [id, el] of els) {
    if (!seen.has(id)) { el.remove(); els.delete(id); }
  }
}
