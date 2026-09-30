// Palma abierta sostenida: los 4 dedos estirados y el pulgar separado, quieta
// durante PALM.HOLD_MS. Dispara una sola vez por cada vez que se abre la mano.
// En la fase 5 abre/cierra el menu; hoy solo se emite el evento.
import { dist } from "../../core/util.js";
import { PALM } from "../../core/config.js";

export function isOpenPalm(m) {
  return Math.min(m.f8, m.f12, m.f16, m.f20) > PALM.EXT_MIN && m.ratio > PALM.SPREAD_MIN;
}

export function createPalmState() { return { since: null, startPos: null, fired: false, progress: 0 }; }

// m = metricas de pinchMetrics, pos = posicion en pantalla, pinched = pinch confirmado.
// Devuelve true solo en el frame en que se completa el gesto.
export function stepPalm(st, m, pos, now, pinched) {
  const open = !pinched && isOpenPalm(m);
  if (!open) { st.since = null; st.fired = false; st.progress = 0; return false; }
  if (st.since === null || dist(st.startPos, pos) > PALM.STILL_PX) {
    st.since = now; st.startPos = { x: pos.x, y: pos.y };
  }
  st.progress = Math.min(1, (now - st.since) / PALM.HOLD_MS);
  if (st.progress >= 1 && !st.fired) { st.fired = true; return true; }
  return false;
}
