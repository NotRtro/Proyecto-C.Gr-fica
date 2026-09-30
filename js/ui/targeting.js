// A que boton apunta la mano (docs/14, paso B). Puro: los elementos solo se
// comparan por identidad y sus rectangulos llegan por rectOf(), asi se prueba en
// Node sin DOM (tests/run.mjs).
//
//   stickyTarget  histeresis: el boton apuntado no cambia hasta que el cursor
//                 sale del actual por HYSTERESIS_PX. Evita que el resaltado
//                 parpadee entre filas vecinas por el temblor de la mano.
//   nearestIn     en un hueco entre filas vale la fila mas cercana (NEAR_PX): el
//                 area activa cubre toda la columna, no solo el dibujo.
//   pickIntent    al confirmarse el pinch, el objetivo es lo MAS apuntado ANTES de
//                 juntar los dedos: al cerrarlos el cursor salta 20-35 px y caeria
//                 en la fila vecina.
import { UI_TARGET } from "../core/config.js";

function inside(r, x, y, pad = 0) {
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

export function stickyTarget(current, candidate, x, y, rectOf, margin = UI_TARGET.HYSTERESIS_PX) {
  if (candidate === current) return current;
  if (current && inside(rectOf(current), x, y, margin)) return current;
  return candidate || null;
}

// El boton de `list` mas cercano verticalmente a (x, y), si esta a menos de maxPx
// y el punto cae dentro de su franja horizontal.
export function nearestIn(list, x, y, rectOf, maxPx = UI_TARGET.NEAR_PX) {
  let best = null, bestD = Infinity;
  for (const el of list) {
    const r = rectOf(el);
    if (x < r.left || x > r.right) continue;
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < bestD) { best = el; bestD = d; }
  }
  return bestD <= maxPx ? best : null;
}

// history: [{ t, el }] (el puede ser null). Devuelve el elemento con mas muestras
// en (now - windowMs, now - skipMs], o null. El tramo final se descarta porque en
// el los dedos ya se estaban juntando (el pinch se confirma ~2 frames despues).
export function pickIntent(history, now, windowMs = UI_TARGET.INTENT_MS, skipMs = UI_TARGET.INTENT_SKIP_MS) {
  const counts = new Map();
  for (const s of history) {
    if (!s.el || s.t <= now - windowMs || s.t > now - skipMs) continue;
    counts.set(s.el, (counts.get(s.el) || 0) + 1);
  }
  let best = null, n = 0;
  for (const [el, c] of counts) if (c > n) { best = el; n = c; }
  return best;
}

// Punto donde se DIBUJA el cursor: su "y" se acerca al centro de la fila apuntada.
export function magnetPoint(x, y, rect, k = UI_TARGET.MAGNET) {
  if (!rect) return { x, y };
  const cy = (rect.top + rect.bottom) / 2;
  return { x, y: y + (cy - y) * k };
}

// ---- seleccion por permanencia (dwell, docs/14 M5) -------------------------
// Dejar el cursor quieto DWELL_MS sobre un boton lo pulsa, sin pinch. Dispara UNA
// vez: para repetir hay que salir del boton y volver. `key` identifica el boton
// por su accion (no por el nodo del DOM), porque el menu se re-dibuja al pulsar
// y un nodo nuevo reiniciaria el conteo (una carpeta se abriria y cerraria sola).

export function createDwell() { return { key: null, t0: 0, x0: 0, y0: 0, fired: false }; }

// Devuelve true solo en el frame en que se completa la permanencia.
export function stepDwell(d, key, x, y, now, ms = UI_TARGET.DWELL_MS, movePx = UI_TARGET.DWELL_MOVE_PX) {
  if (key !== d.key) { d.key = key; d.t0 = now; d.x0 = x; d.y0 = y; d.fired = false; return false; }
  if (!key || d.fired) return false;
  if (Math.hypot(x - d.x0, y - d.y0) > movePx) { d.t0 = now; d.x0 = x; d.y0 = y; return false; }
  if (now - d.t0 >= ms) { d.fired = true; return true; }
  return false;
}

export function dwellProgress(d, now, ms = UI_TARGET.DWELL_MS) {
  return !d.key || d.fired ? 0 : Math.min(1, (now - d.t0) / ms);
}
