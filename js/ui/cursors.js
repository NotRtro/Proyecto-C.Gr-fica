// Dibuja un cursor por mano detectada, con estados visuales:
//   (normal)   mano detectada: aro tenue
//   hover-item apuntando a algo que se puede agarrar: aro brillante y mas grande
//   hover-ui   apuntando a un boton de la interfaz
//   pinched    pinch confirmado: relleno
//   lost       la mano se perdio un instante: atenuado
//   progress   gesto de "mantener" en curso (levantar el orbe, Salir, palma de "alto"): anillo que se llena
//   dial       palma "perilla": girando el modelo con la muneca
// El mouse no se dibuja: ya tiene el puntero del sistema.
const els = new Map();

function layer() { return document.getElementById("cursors"); }

// opts.kindAt(x, y) -> "ui" | "item" | null ; opts.progressOf(handState) -> 0..1
// opts.displayOf(handState) -> {x, y} (opcional): donde dibujarlo (cursor magnetico del menu)
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
    el.style.setProperty("--p", p.toFixed(3));
  }
  for (const [id, el] of els) {
    if (!seen.has(id)) { el.remove(); els.delete(id); }
  }
}

// Pulso breve en el cursor de una mano al confirmar una pulsacion (docs/14 M7).
export function pulseCursor(hand) {
  const el = els.get(hand);
  if (!el) return;
  el.classList.remove("confirm");
  void el.offsetWidth; // reinicia la animacion si llega otro pulso seguido
  el.classList.add("confirm");
  setTimeout(() => el.classList.remove("confirm"), 320);
}
