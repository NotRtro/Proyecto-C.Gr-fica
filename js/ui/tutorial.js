// Tutorial de primer uso: el usuario PRACTICA cada gesto y solo avanza cuando lo
// logra. Cada paso tambien se puede cumplir con el mouse. Se recuerda que ya se
// hizo (settings.tutorialDone) y se puede repetir desde Menu > Gestos y ayuda.
import { store } from "../core/store.js";
import { on } from "../core/bus.js";
import { setSetting } from "../core/settings.js";
import { registerAction } from "./actions.js";
import { toast } from "./feedback.js";

const STEPS = [
  { title: "Muestra una mano a la cámara", hint: "Sin cámara: mueve el mouse sobre la pantalla.",
    check: () => store.hands.some((h) => h.present) },
  { title: "Haz pinch: junta el pulgar y el índice", hint: "Con el mouse: mantén presionado el clic.",
    event: "cursor:pinch-start" },
  { title: "Agarra el reactor y muévelo", hint: "Pinch sobre el reactor, arrastra y suelta.",
    event: "grab:end" },
  { title: "Abre el menú: pinch rápido sobre el orbe «HeyTECHI»", hint: "Junta y suelta los dedos sobre el orbe que flota a la izquierda.",
    event: "menu:open" },
];

const SUCCESS_MS = 700;

let card = null;
let step = -1;
let advancing = false;

function render() {
  const s = STEPS[step];
  card.querySelector(".tut-step").textContent = "Paso " + (step + 1) + " de " + STEPS.length;
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
    if (step >= STEPS.length) finish("¡Listo! Tienes la ayuda siempre en Menú › Gestos y ayuda.");
    else render();
  }, SUCCESS_MS);
}

function finish(message) {
  if (card) card.remove();
  card = null; step = -1; advancing = false;
  setSetting("tutorialDone", true);
  if (message) toast(message, { ms: 4000 });
}

// Los eventos de cada paso se escuchan siempre; solo cuentan si es el paso actual.
for (const [i, s] of STEPS.entries()) {
  if (s.event) on(s.event, () => { if (card && step === i) advance(); });
}

registerAction("tutorial:skip", () => finish("Tutorial omitido. Puedes repetirlo en Menú › Gestos y ayuda."));

export function startTutorial() {
  if (card) card.remove();
  card = document.createElement("div");
  card.className = "tutorial";
  card.setAttribute("data-ui", "");
  card.innerHTML =
    '<div class="tut-top"><span class="tut-step"></span>' +
    '<button class="ui-btn small" type="button" data-action="tutorial:skip">Saltar</button></div>' +
    '<div class="tut-title"></div><div class="tut-hint"></div>' +
    '<div class="tut-dots">' + STEPS.map(() => '<span class="tut-dot"></span>').join("") + "</div>";
  document.getElementById("ui").appendChild(card);
  step = 0; advancing = false;
  render();
}

// Llamar una vez por frame: revisa los pasos que se cumplen por estado (no por evento).
export function updateTutorial() {
  if (!card || advancing) return;
  const s = STEPS[step];
  if (s.check && s.check()) advance();
}
