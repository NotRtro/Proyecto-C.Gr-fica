// Motor de gestos: convierte las manos seguidas (hands.js) en un "estado de mano"
// por cada una, que es lo que consume el arbitro. Sin DOM: se usa igual en el
// navegador y en los tests de Node.
//
// Estado de mano:
//   id, source ("hand"|"mouse"), handedness, present
//   x, y          cursor en pantalla (punto medio pulgar-indice)
//   ax, ay        ancla: igual al cursor, pero congelada mientras se confirma que
//                 el pinch se solto (al abrir los dedos el punto medio salta y
//                 arrastraria el objeto o arruinaria un tap)
//   pinched       pinch confirmado
//   pinchChanged  "start" | "end" | null (solo en el frame en que cambia)
//   palmProgress  0..1 de la palma abierta sostenida; palmFired true al completarla
//   removed       true en el ultimo estado de una mano que se fue
//   metrics       metricas crudas (HUD)
import { midpoint } from "../core/util.js";
import { toScreen } from "./coords.js";
import { pinchMetrics, createPinchState, stepPinch } from "./recognizers/pinch.js";
import { createPalmState, stepPalm } from "./recognizers/palm.js";

export function createGestureEngine() {
  const per = new Map();
  let last = [];

  function snapshot(id, s, extra) {
    return {
      id, source: "hand", handedness: s.handedness, present: s.present,
      x: s.x, y: s.y, ax: s.ax, ay: s.ay,
      pinched: s.pinch.pinched, pinchChanged: null,
      palmProgress: s.palm.progress, palmFired: false,
      removed: false, metrics: s.metrics, ...extra,
    };
  }

  // Un frame NUEVO de camara (o de grabacion).
  function update(tracks, video, now, view) {
    const out = [];
    const seen = new Set();
    for (const t of tracks) {
      seen.add(t.id);
      let s = per.get(t.id);
      if (!s) {
        s = { pinch: createPinchState(), palm: createPalmState(), x: 0, y: 0, ax: 0, ay: 0, metrics: null };
        per.set(t.id, s);
      }
      s.handedness = t.handedness;
      s.present = t.present;
      let change = null, palmFired = false;
      if (t.present) {
        const m = pinchMetrics(t.lm, video);
        change = stepPinch(s.pinch, m);
        const pos = midpoint(toScreen(t.lm[8], video, view), toScreen(t.lm[4], video, view));
        s.x = pos.x; s.y = pos.y;
        // El ancla sigue al cursor salvo mientras se suelta el pinch, incluido el
        // frame en que se confirma "end" (el arbitro mide el tap con ese valor).
        const releasing = (s.pinch.pinched && !s.pinch.raw) || change === "end";
        if (!releasing) { s.ax = pos.x; s.ay = pos.y; }
        s.metrics = m;
        palmFired = stepPalm(s.palm, m, pos, now, s.pinch.pinched);
      }
      out.push(snapshot(t.id, s, { pinchChanged: change, palmFired }));
    }
    for (const [id, s] of per) {
      if (seen.has(id)) continue;
      out.push(snapshot(id, s, {
        present: false, pinched: false, removed: true,
        pinchChanged: s.pinch.pinched ? "end" : null,
      }));
      per.delete(id);
    }
    last = out;
    return out;
  }

  // Frame de pantalla SIN camara nueva: mismos estados, sin transiciones.
  function repeat() {
    return last.filter((h) => !h.removed).map((h) => ({ ...h, pinchChanged: null, palmFired: false }));
  }

  function reset() { per.clear(); last = []; }

  return { update, repeat, reset };
}
