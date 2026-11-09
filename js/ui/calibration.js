import { registerAction } from "./actions.js";
import { toast } from "./feedback.js";
import { setSetting } from "../core/settings.js";
import { analyzeHand } from "../input/calibration.js";
import { input } from "../stage/interaction.js";

const STEPS = [
  { title: "Mano abierta y quieta", hint: "Muestra la palma a la cámara y no la muevas.", ms: 3000 },
  { title: "Pinch sostenido", hint: "Junta el pulgar y el índice hasta que se toquen, y mantenlos así.", ms: 2000 },
  { title: "Pinch y soltar, 4 veces", hint: "Despacio y sin mover la mano de lugar.", ms: 5000 },
];

let card = null;
let step = -1;
let elapsed = 0;
let lastT = null;
let samples = [];
let result = null;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label, action, primary) {
  const b = el("button", "ui-btn" + (primary ? " primary" : ""), label);
  b.type = "button";
  b.dataset.action = action;
  return b;
}

let view = null;

function buildStep() {
  const s = STEPS[step];
  const hint = el("div", "tut-hint", s.hint);
  const bar = el("div", "calib-bar");
  const fill = el("div", "calib-fill");
  bar.appendChild(fill);
  const row = el("div", "calib-actions");
  row.appendChild(button("Cancelar", "calib:cancel"));
  card.replaceChildren(el("div", "tut-step", "Calibración · paso " + (step + 1) + " de " + STEPS.length),
    el("div", "tut-title", s.title), hint, bar, row);
  view = { hint, fill };
}

function updateStep(handVisible) {
  const s = STEPS[step];
  view.fill.style.width = Math.min(100, (elapsed / s.ms) * 100).toFixed(1) + "%";
  const text = handVisible ? s.hint : "No veo tu mano: ponla frente a la cámara.";
  if (view.hint.textContent !== text) view.hint.textContent = text;
}

function renderResult() {
  const r = result;
  const row = el("div", "calib-actions");
  if (!r.ok) {
    card.replaceChildren(el("div", "tut-step", "Calibración"), el("div", "tut-title", "No se pudo calibrar"),
      el("div", "tut-hint", r.reason));
    row.append(button("Cerrar", "calib:cancel"), button("Reintentar", "calib:start", true));
    card.appendChild(row);
    return;
  }
  const lines = [
    "Temblor del cursor: " + r.jitterPx.toFixed(1) + " px",
    "Dedos abiertos / en pinch: " + r.ratioOpen.toFixed(2) + " / " + r.ratioPinch.toFixed(2),
    "Salto al juntar los dedos: " + (Number.isFinite(r.jumpPx) ? r.jumpPx.toFixed(0) + " px" : "—"),
    "Pinch se activa bajo: " + r.suggest.ratioEnter.toFixed(2) + " (fábrica 0.35)",
  ];
  const list = el("div", "calib-results");
  for (const l of lines) list.appendChild(el("div", "", l));
  for (const w of r.warnings) list.appendChild(el("div", "calib-warn", "! " + w));
  card.replaceChildren(el("div", "tut-step", "Calibración"), el("div", "tut-title", "Listo: estos son tus valores"), list);
  row.append(button("Descartar", "calib:cancel"), button("Guardar", "calib:save", true));
  card.appendChild(row);
}

function finish() {
  if (card) card.remove();
  card = null; step = -1; result = null; samples = [];
  input.arbiter.setLocked(false);
}

export function startCalibration() {
  if (card) card.remove();
  card = el("div", "tutorial calib");
  card.setAttribute("data-ui", "");
  document.getElementById("ui").appendChild(card);
  step = 0; elapsed = 0; lastT = null; samples = []; result = null;
  input.arbiter.setLocked(true);
  buildStep();
  updateStep(false);
}

export function updateCalibration(hands, now) {
  if (!card || step < 0) return;
  const dt = lastT === null ? 0 : Math.min(now - lastT, 100);
  lastT = now;
  const h = hands.find((s) => s.source === "hand" && s.present && s.metrics);
  if (h) {
    samples.push({ t: now, x: h.ax, y: h.ay, ratio: h.metrics.ratio, span: h.spanPx });
    elapsed += dt;
  }
  if (elapsed >= STEPS[step].ms) {
    step++; elapsed = 0;
    if (step >= STEPS.length) {
      step = -1;
      result = analyzeHand(samples);
      renderResult();
      return;
    }
    buildStep();
  }
  updateStep(!!h);
}

export function calibrationActive() { return !!card; }

registerAction("calib:start", () => startCalibration());
registerAction("calib:cancel", () => finish());
registerAction("calib:save", () => {
  const r = result;
  if (r && r.ok) {
    setSetting("calibration", { ...r.suggest, jitterPx: +r.jitterPx.toFixed(2),
      jumpPx: Number.isFinite(r.jumpPx) ? +r.jumpPx.toFixed(1) : null, date: new Date().toISOString() });
    toast("Calibración guardada: los umbrales ahora se ajustan a tu mano");
  }
  finish();
});
registerAction("calib:reset", () => {
  setSetting("calibration", null);
  toast("Se volvió a los valores de fábrica");
});
