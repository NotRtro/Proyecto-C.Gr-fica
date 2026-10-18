// Indicador del armado guiado (fase 7E): "Paso 3 de 16 · Rueda trasera izquierda".
// Solo informa: no tapa la escena (sin data-ui y sin eventos de puntero).
import { on } from "../core/bus.js";
import { toast } from "./feedback.js";

let el = null;

function banner() {
  if (!el) {
    el = document.createElement("div");
    el.className = "guide-banner";
    document.getElementById("ui").appendChild(el);
  }
  return el;
}

function hide() { if (el) { el.remove(); el = null; } }

on("guide:update", ({ item, step, total, label }) => {
  const b = banner();
  b.replaceChildren();
  const head = document.createElement("div");
  head.className = "guide-step";
  head.textContent = "Armado guiado · " + (item.title || "modelo") + " · paso " + step + " de " + total;
  const name = document.createElement("div");
  name.className = "guide-label";
  name.textContent = label;
  const hint = document.createElement("div");
  hint.className = "guide-hint";
  hint.textContent = "Lleva la pieza que brilla a su silueta";
  b.append(head, name, hint);
});

on("guide:end", ({ done }) => {
  hide();
  if (!done) toast("Armado guiado terminado");
});

// Una pieza soltada junto a su lugar pero fuera de turno.
on("piece:drop", ({ wrong, label, expected }) => {
  if (wrong) toast(label + " todavía no: ahora va " + expected, { kind: "error", ms: 2400 });
});

on("item:removed", hide);
