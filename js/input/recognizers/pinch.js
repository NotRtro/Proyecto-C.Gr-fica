// Pinch (docs/05). Funciones puras: reciben landmarks y devuelven numeros, sin
// tocar DOM ni estado global.
import { dist } from "../../core/util.js";
import { PINCH, PINCH_CLOSED } from "../../core/config.js";
import { toVideoPx } from "../coords.js";

// Cuanto se extiende cada dedo: dist(punta, muneca) / dist(nudillo, muneca).
// ~1.0 = doblado, ~1.8+ = estirado.
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

// Dos formas de hacer pinch:
//   "ok"     indice doblado y los otros tres dedos estirados (firma OK de docs/05).
//   "closed" medio, anular y menique recogidos. Un puno tambien acerca pulgar e
//            indice, asi que se exige que las puntas se toquen de verdad (corte de
//            ratio mas estricto) y que el indice no este metido en la palma (f8).
// Los cortes de "closed" son una fraccion de los de "ok": la calibracion y la
// sensibilidad los mueven juntos.
// Histeresis: entrar exige umbrales estrictos, mantener usa umbrales laxos.
// Devuelve "ok", "closed" o null.
export function pinchKind(wasPinched, m) {
  const ok = wasPinched
    ? m.arch > PINCH.ARCH_HOLD && m.backMean > PINCH.BACKMEAN_HOLD && m.ratio < PINCH.RATIO_HOLD
    : m.arch > PINCH.ARCH_ENTER && m.backMean > PINCH.BACKMEAN_ENTER && m.ratio < PINCH.RATIO_ENTER;
  if (ok) return "ok";
  const closed = wasPinched
    ? m.f8 > PINCH_CLOSED.F8_HOLD && m.ratio < PINCH.RATIO_HOLD * PINCH_CLOSED.RATIO_HOLD_K
    : m.f8 > PINCH_CLOSED.F8_ENTER && m.ratio < PINCH.RATIO_ENTER * PINCH_CLOSED.RATIO_ENTER_K;
  return closed ? "closed" : null;
}

export function pinchTransition(wasPinched, m) { return pinchKind(wasPinched, m) !== null; }

export function createPinchState() { return { pinched: false, raw: false, pending: 0, kind: null }; }

// Avanza un frame de camara. Ademas de la histeresis exige CONFIRM_FRAMES
// frames seguidos para cambiar de estado. Devuelve "start", "end" o null.
// `st.raw` indica si ESTE frame cumple el criterio (util para congelar el
// ancla mientras se confirma la salida).
export function stepPinch(st, m) {
  st.kind = pinchKind(st.pinched, m);
  st.raw = st.kind !== null;
  if (st.raw === st.pinched) { st.pending = 0; return null; }
  st.pending++;
  if (st.pending < PINCH.CONFIRM_FRAMES) return null;
  st.pinched = st.raw;
  st.pending = 0;
  return st.pinched ? "start" : "end";
}
