// Pinch (docs/05). Funciones puras: reciben landmarks y devuelven numeros, sin
// tocar DOM ni estado global.
import { dist } from "../../core/util.js";
import { PINCH } from "../../core/config.js";
import { toVideoPx } from "../coords.js";

// Cuanto se extiende cada dedo: dist(punta, muneca) / dist(nudillo, muneca).
// ~1.0 = doblado, ~1.8+ = estirado. Compartido con el reconocedor de palma.
export function fingerExtensions(P) {
  const ext = (tip, mcp) => dist(P[tip], P[0]) / Math.max(dist(P[mcp], P[0]), 1e-3);
  return { f8: ext(8, 5), f12: ext(12, 9), f16: ext(16, 13), f20: ext(20, 17) };
}

export function pinchMetrics(lm, video) {
  const P = lm.map((p) => toVideoPx(p, video));
  const span = dist(P[0], P[9]);
  const gap = dist(P[4], P[8]);
  const ratio = gap / Math.max(span, 1e-3);
  const { f8, f12, f16, f20 } = fingerExtensions(P);
  const backMean = (f12 + f16 + f20) / 3;
  return { ratio, arch: backMean - f8, backMean, span, f8, f12, f16, f20 };
}

// Histeresis: entrar exige umbrales estrictos, mantener usa umbrales laxos.
export function pinchTransition(wasPinched, m) {
  if (!wasPinched) {
    return m.arch > PINCH.ARCH_ENTER && m.backMean > PINCH.BACKMEAN_ENTER && m.ratio < PINCH.RATIO_ENTER;
  }
  return m.arch > PINCH.ARCH_HOLD && m.backMean > PINCH.BACKMEAN_HOLD && m.ratio < PINCH.RATIO_HOLD;
}

export function createPinchState() { return { pinched: false, raw: false, pending: 0 }; }

// Avanza un frame de camara. Ademas de la histeresis exige CONFIRM_FRAMES
// frames seguidos para cambiar de estado. Devuelve "start", "end" o null.
// `st.raw` indica si ESTE frame cumple el criterio (util para congelar el
// ancla mientras se confirma la salida).
export function stepPinch(st, m) {
  st.raw = pinchTransition(st.pinched, m);
  if (st.raw === st.pinched) { st.pending = 0; return null; }
  st.pending++;
  if (st.pending < PINCH.CONFIRM_FRAMES) return null;
  st.pinched = st.raw;
  st.pending = 0;
  return st.pinched ? "start" : "end";
}
