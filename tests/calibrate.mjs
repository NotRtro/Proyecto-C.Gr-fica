import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createHandTracker } from "../js/input/hands.js";
import { createGestureEngine } from "../js/input/gestures.js";
import { frameToDetections } from "../js/input/recorder.js";
import { analyzeHand } from "../js/input/calibration.js";

export function samplesFromRecording(rec) {
  const tracker = createHandTracker(), engine = createGestureEngine();
  const video = { videoWidth: rec.video.w, videoHeight: rec.video.h };
  const view = { w: rec.video.w, h: rec.video.h };
  const samples = [];
  for (const f of rec.frames) {
    const hands = engine.update(tracker.update(frameToDetections(f), f.t), video, f.t, view);
    const h = hands.find((s) => s.present && s.metrics);
    if (h) samples.push({ t: f.t, x: h.ax, y: h.ay, rx: h.rawX, ry: h.rawY, ratio: h.metrics.ratio, span: h.spanPx });
  }
  return samples;
}

function main(file) {
  const rec = JSON.parse(readFileSync(file, "utf8"));
  const r = analyzeHand(samplesFromRecording(rec));
  console.log("Calibracion de " + file + " (" + rec.frames.length + " frames)\n");
  if (!r.ok) { console.log("No se pudo calibrar: " + r.reason); process.exit(1); }
  console.log("  temblor de la mano (crudo):  " + r.rawJitterPx.toFixed(1) + " px");
  console.log("  temblor del cursor (quieto): " + r.jitterPx.toFixed(1) + " px");
  console.log("  ratio mano abierta:          " + r.ratioOpen.toFixed(3));
  console.log("  ratio en pinch:              " + r.ratioPinch.toFixed(3));
  console.log("  salto al juntar los dedos:   " + r.jumpPx.toFixed(1) + " px (" + r.transitions + " pinch)");
  console.log("  tamano de la mano:           " + r.spanPx.toFixed(0) + " px");
  for (const w of r.warnings) console.log("  ! " + w);
  console.log("\nUmbrales sugeridos (el asistente de la app los guarda solo; a mano van en js/core/config.js):");
  console.log("  PINCH.RATIO_ENTER = " + r.suggest.ratioEnter + ", PINCH.RATIO_HOLD = " + r.suggest.ratioHold);
  console.log("  UI_TARGET.HYSTERESIS_PX = " + r.suggest.hysteresisPx);
  console.log("  UI_PRESS.TRAVEL_MIN = " + r.suggest.travelMinPx);
  console.log("  CURSOR_FILTER.minCutoff = " + r.suggest.minCutoff);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.log("uso: node tests/calibrate.mjs <grabacion.json>"); process.exit(1); }
  main(process.argv[2]);
}
