import { store } from "../core/store.js";
import { on } from "../core/bus.js";
import { HOLO, PIECES } from "../core/config.js";
import { setSetting } from "../core/settings.js";
import { findExplodable } from "../items/registry.js";
import { catalog, refreshCatalog } from "../net/catalog.js";
import { addModel } from "../stage/models.js";
import { registerAction } from "./actions.js";
import { toast } from "./feedback.js";

function pieceModel() {
  const m = findExplodable();
  return m && m.type === "model" && m.view.ready && m.view.parts.length >= 2 ? m : null;
}

const TOURS = {
  basico: [
    { title: "Muestra una mano a la cámara", hint: "Sin cámara: mueve el mouse sobre la pantalla.",
      check: () => store.hands.some((h) => h.present) },
    { title: "Haz pinch: junta el pulgar y el índice", hint: "El centro del cursor se llena a medida que juntas los dedos. Con el mouse: mantén presionado el clic.",
      event: "cursor:pinch-start" },
    { title: "Agarra el reactor y muévelo", hint: "Pinch sobre el reactor, arrastra y suelta.",
      event: "grab:end" },
    { title: "Abre el menú: pinch rápido sobre el orbe «HeyTECHI»", hint: "Junta y suelta los dedos sobre el orbe que flota a la izquierda.",
      event: "menu:open" },
  ],
  piezas: [
    { title: "Desarma el modelo", hint: "Pinch en un lugar vacío y arrastra hacia la derecha. Con el mouse: arrastra en vacío.",
      check: () => { const m = pieceModel(); return !!m && m.explode / HOLO.EXPLODE_OUT > PIECES.PICK_MIN_EXPLODE * 2; } },
    { title: "Pasa la mano sobre una pieza", hint: "Se ilumina y aparece su nombre.",
      check: () => { const m = pieceModel(); return !!m && m.hoverPart >= 0; } },
    { title: "Saca una pieza", hint: "Pinch sobre la pieza y arrástrala. Su lugar se ve como una silueta cian.",
      event: "piece:grab" },
    { title: "Encájala: suéltala sobre su silueta", hint: "Cerca de su lugar se imanta sola.",
      event: "piece:drop", accept: (p) => p.snapped },
    { title: "Detén el giro: palma de «alto» quieta", hint: "Mano abierta y vertical frente al modelo, sin moverla, hasta que se llene el anillo. Con el mouse: Herramientas › Detener giro.",
      event: ["palm:stop", "spin:changed"], accept: (p) => p.paused },
  ],
};

const DONE_TEXT = {
  basico: "¡Listo! Tienes la ayuda siempre en Menú › Gestos.",
  piezas: "¡Listo! Prueba el armado completo en Menú › Herramientas › Armado guiado.",
};

const SUCCESS_MS = 700;

let card = null;
let tour = null;
let step = -1;
let advancing = false;

const steps = () => TOURS[tour];

function render() {
  const s = steps()[step];
  card.querySelector(".tut-step").textContent = "Paso " + (step + 1) + " de " + steps().length;
  card.querySelector(".tut-title").textContent = s.title;
  card.querySelector(".tut-hint").textContent = s.hint;
  card.querySelectorAll(".tut-dot").forEach((d, i) => {
    d.classList.toggle("done", i < step);
    d.classList.toggle("current", i === step);
  });
  card.classList.remove("success");
}

function advance() {
  if (advancing || !card) return;
  advancing = true;
  card.classList.add("success");
  setTimeout(() => {
    advancing = false;
    if (!card) return;
    step++;
    if (step >= steps().length) finish(DONE_TEXT[tour]);
    else render();
  }, SUCCESS_MS);
}

function finish(message) {
  if (card) card.remove();
  if (tour === "basico") setSetting("tutorialDone", true);
  card = null; tour = null; step = -1; advancing = false;
  if (message) toast(message, { ms: 4000 });
}

for (const [name, list] of Object.entries(TOURS)) {
  for (const [i, s] of list.entries()) {
    if (!s.event) continue;
    for (const evt of [].concat(s.event)) {
      on(evt, (payload) => {
        if (card && tour === name && step === i && (!s.accept || s.accept(payload || {}))) advance();
      });
    }
  }
}

registerAction("tutorial:skip", () => finish("Tutorial omitido. Puedes repetirlo en Menú › Gestos."));

async function ensurePieceModel() {
  if (pieceModel()) return true;
  if (!catalog().length) await refreshCatalog();
  const entry = catalog()[0];
  if (!entry) {
    toast("Para practicar piezas copia un modelo .glb en media/models", { kind: "error", ms: 5000 });
    return false;
  }
  addModel(entry.src);
  return true;
}

export async function startTutorial(name = "basico") {
  if (!TOURS[name]) return;
  if (name === "piezas" && !(await ensurePieceModel())) return;
  if (card) card.remove();
  tour = name;
  card = document.createElement("div");
  card.className = "tutorial";
  card.setAttribute("data-ui", "");
  card.innerHTML =
    '<div class="tut-top"><span class="tut-step"></span>' +
    '<button class="ui-btn small" type="button" data-action="tutorial:skip">Saltar</button></div>' +
    '<div class="tut-title"></div><div class="tut-hint"></div>' +
    '<div class="tut-dots">' + steps().map(() => '<span class="tut-dot"></span>').join("") + "</div>";
  document.getElementById("ui").appendChild(card);
  step = 0; advancing = false;
  render();
}

export function updateTutorial() {
  if (!card || advancing) return;
  const s = steps()[step];
  if (s.check && s.check()) advance();
}
