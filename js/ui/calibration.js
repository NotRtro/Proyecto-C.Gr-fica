import { registerAction } from "./actions.js";
import { toast } from "./feedback.js";
import { setSetting } from "../core/settings.js";
import { analyzeHand, PROTOCOL } from "../input/calibration.js";
import { pinchFailure } from "../input/recognizers/pinch.js";
import { input } from "../stage/interaction.js";

const TEXT = {
  open: { title: "Mano abierta y quieta", hint: "Muestra la palma a la cámara y no la muevas." },
  pinch: { title: "Pinch sostenido", hint: "Junta el pulgar y el índice hasta que se toquen, y mantenlos así." },
  taps: { title: "Pinch y soltar, 4 veces", hint: "Despacio y sin mover la mano de lugar." },
  fist: { title: "Puño cerrado", hint: "Cierra la mano en un puño, con el pulgar por fuera." },
  relaxed: { title: "Mano relajada", hint: "Deja la mano suelta, con los dedos un poco doblados, sin hacer pinch." },
};

const FAILURE = {
  gap: "Pinch no detectado: junta más el pulgar y el índice.",
  tips: "Pinch no detectado: que las puntas del pulgar y el índice se toquen.",
  shape: "Pinch no detectado: estira los otros tres dedos, o recógelos del todo sin meter el índice.",
  fist: "Pinch no detectado: tu mano se ve como un puño; deja el índice más estirado.",
};

const STEPS = PROTOCOL.map((p) => ({ ...p, ...TEXT[p.phase] }));
const PINCH_PHASES = new Set(["pinch", "taps"]);
const IMPOSTOR_PHASES = new Set(["fist", "relaxed"]);

let card = null;
let step = -1;
let elapsed = 0;
let lastT = null;
let samples = [];
let result = null;
let view = null;

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

function buildStep() {
  const s = STEPS[step];
  const hint = el("div", "tut-hint", s.hint);
  const live = el("div", "calib-live");
  const bar = el("div", "calib-bar");
  const fill = el("div", "calib-fill");
  bar.appendChild(fill);
  const row = el("div", "calib-actions");
  row.appendChild(button("Cancelar", "calib:cancel"));
  card.replaceChildren(el("div", "tut-step", "Calibración · paso " + (step + 1) + " de " + STEPS.length),
    el("div", "tut-title", s.title), hint, live, bar, row);
  view = { hint, live, fill };
}

function liveStatus(s, h) {
  if (!h) return { text: "", kind: "" };
  if (PINCH_PHASES.has(s.phase)) {
    if (h.pinched) return { text: "Pinch detectado ✓", kind: "good" };
    if (s.phase === "taps") return { text: "", kind: "" };
    return { text: FAILURE[pinchFailure(h.metrics)] || "", kind: "bad" };
  }
  if (IMPOSTOR_PHASES.has(s.phase)) {
    return h.pinched
      ? { text: "Esta pose se está tomando por pinch", kind: "bad" }
      : { text: "Bien: no es pinch ✓", kind: "good" };
  }
  return { text: "", kind: "" };
}

function updateStep(h) {
  const s = STEPS[step];
  view.fill.style.width = Math.min(100, (elapsed / s.ms) * 100).toFixed(1) + "%";
  const text = h ? s.hint : "No veo tu mano: ponla frente a la cámara.";
  if (view.hint.textContent !== text) view.hint.textContent = text;
  const live = liveStatus(s, h);
  if (view.live.textContent !== live.text) view.live.textContent = live.text;
  view.live.className = "calib-live" + (live.kind ? " " + live.kind : "");
}

const percent = (v) => (Number.isFinite(v) ? Math.round(v * 100) + " %" : "—");

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
    "Pinch reconocido: " + percent(r.pinchDetect),
    "Puño o mano relajada tomados por pinch: " + percent(r.impostorRate),
    "Forma del pinch: " + (r.gatesChanged.length ? "ajustada a tu mano" : "valores de fábrica"),
    "Detector de puño (modelo): " + (Number.isFinite(r.modelFistAsFist)
      ? (r.suggest.fistVeto ? "activado" : "no se usa") + " · reconoce tu puño " + percent(r.modelFistAsFist)
        + " · confunde tu pinch " + percent(r.modelPinchAsFist)
      : "sin datos del modelo"),
    "Temblor de la mano: " + (Number.isFinite(r.rawJitterPx) ? r.rawJitterPx.toFixed(1) + " px" : "—"),
    "Temblor del cursor: " + r.jitterPx.toFixed(1) + " px",
    "Suavizado del cursor: " + (Number.isFinite(r.suggest.minCutoff) ? r.suggest.minCutoff.toFixed(2) + " Hz (fábrica 1.20)" : "—"),
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
  updateStep(null);
}

export function updateCalibration(hands, now) {
  if (!card || step < 0) return;
  const dt = lastT === null ? 0 : Math.min(now - lastT, 100);
  lastT = now;
  const h = hands.find((s) => s.source === "hand" && s.present && s.metrics);
  if (h) {
    const m = h.metrics;
    samples.push({ t: now, phase: STEPS[step].phase, x: h.ax, y: h.ay, rx: h.rawX, ry: h.rawY,
      ratio: m.ratio, arch: m.arch, backMean: m.backMean, f8: m.f8, model: m.gesture, span: h.spanPx });
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
  updateStep(h || null);
}

export function calibrationActive() { return !!card; }

registerAction("calib:start", () => startCalibration());
registerAction("calib:cancel", () => finish());
registerAction("calib:save", () => {
  const r = result;
  if (r && r.ok) {
    setSetting("calibration", { ...r.suggest, jitterPx: +r.jitterPx.toFixed(2),
      rawJitterPx: Number.isFinite(r.rawJitterPx) ? +r.rawJitterPx.toFixed(2) : null,
      jumpPx: Number.isFinite(r.jumpPx) ? +r.jumpPx.toFixed(1) : null, date: new Date().toISOString() });
    toast("Calibración guardada: los umbrales ahora se ajustan a tu mano");
  }
  finish();
});
registerAction("calib:reset", () => {
  setSetting("calibration", null);
  toast("Se volvió a los valores de fábrica");
});
