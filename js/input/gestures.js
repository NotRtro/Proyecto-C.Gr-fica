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
//   spanPx        tamano de la mano en pantalla (muneca -> nudillo del medio), para
//                 umbrales relativos: una mano lejos de la camara es mas chica
//   removed       true en el ultimo estado de una mano que se fue
//   metrics       metricas crudas (HUD)
//
// La posicion del cursor pasa por un filtro One Euro (js/input/filters.js): sin
// el, el ruido de MediaPipe hace temblar el cursor y el resaltado salta entre
// botones vecinos.
import { midpoint } from "../core/util.js";
import { CURSOR_FILTER } from "../core/config.js";
import { toScreen } from "./coords.js";
import { createPointFilter } from "./filters.js";
import { pinchMetrics, createPinchState, stepPinch } from "./recognizers/pinch.js";

export function createGestureEngine() {
  const per = new Map();
  let last = [];

  function snapshot(id, s, extra) {
    return {
      id, source: "hand", handedness: s.handedness, present: s.present,
      x: s.x, y: s.y, ax: s.ax, ay: s.ay, spanPx: s.spanPx,
      pinched: s.pinch.pinched, pinchChanged: null,
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
        s = { pinch: createPinchState(), filter: createPointFilter(CURSOR_FILTER),
          x: 0, y: 0, ax: 0, ay: 0, spanPx: 0, metrics: null };
        per.set(t.id, s);
      }
      s.handedness = t.handedness;
      s.present = t.present;
      let change = null;
      if (t.present) {
        const m = pinchMetrics(t.lm, video);
        change = stepPinch(s.pinch, m);
        const raw = midpoint(toScreen(t.lm[8], video, view), toScreen(t.lm[4], video, view));
        // Al confirmarse el pinch, el punto medio ya salto (los dedos se juntaron):
        // se reinicia el filtro para que la manipulacion parta de la posicion real
        // y el objeto no "derive" mientras el filtro alcanza el salto.
        if (change === "start") s.filter.reset();
        const pos = s.filter.filter(raw, now);
        s.spanPx = m.span * Math.max(view.w / video.videoWidth, view.h / video.videoHeight);
        s.x = pos.x; s.y = pos.y;
        // El ancla sigue al cursor salvo mientras se suelta el pinch, incluido el
        // frame en que se confirma "end" (el arbitro mide el tap con ese valor).
        const releasing = (s.pinch.pinched && !s.pinch.raw) || change === "end";
        if (!releasing) { s.ax = pos.x; s.ay = pos.y; }
        s.metrics = m;
      }
      out.push(snapshot(t.id, s, { pinchChanged: change }));
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
    return last.filter((h) => !h.removed).map((h) => ({ ...h, pinchChanged: null }));
  }

  function reset() { per.clear(); last = []; }

  return { update, repeat, reset };
}
