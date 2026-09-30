// Deteccion de pinch (docs/05). Funciones puras: reciben landmarks y devuelven
// numeros, sin tocar DOM ni estado global.
import { dist } from "../core/util.js";
import { PINCH } from "../core/config.js";
import { toVideoPx } from "./coords.js";

export function pinchMetrics(lm, video) {
  const P = lm.map((p) => toVideoPx(p, video));
  const span = dist(P[0], P[9]);
  const gap = dist(P[4], P[8]);
  const ratio = gap / Math.max(span, 1e-3);
  const f8 = dist(P[8], P[0]) / Math.max(dist(P[5], P[0]), 1e-3);
  const f12 = dist(P[12], P[0]) / Math.max(dist(P[9], P[0]), 1e-3);
  const f16 = dist(P[16], P[0]) / Math.max(dist(P[13], P[0]), 1e-3);
  const f20 = dist(P[20], P[0]) / Math.max(dist(P[17], P[0]), 1e-3);
  const backMean = (f12 + f16 + f20) / 3;
  return { ratio, arch: backMean - f8, backMean, span };
}

// Histeresis: entrar exige umbrales estrictos, mantener usa umbrales laxos.
export function pinchTransition(wasPinched, m) {
  if (!wasPinched) {
    return m.arch > PINCH.ARCH_ENTER && m.backMean > PINCH.BACKMEAN_ENTER && m.ratio < PINCH.RATIO_ENTER;
  }
  return m.arch > PINCH.ARCH_HOLD && m.backMean > PINCH.BACKMEAN_HOLD && m.ratio < PINCH.RATIO_HOLD;
}
