import { dist } from "../../core/util.js";
import { PINCH, PINCH_CLOSED, PINCH_FEEDBACK } from "../../core/config.js";
import { toVideoPx } from "../coords.js";

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

export function pinchStrength(m) {
  const open = PINCH.RATIO_ENTER + PINCH_FEEDBACK.RANGE;
  return Math.max(0, Math.min(1, (open - m.ratio) / (open - PINCH.RATIO_ENTER)));
}

export function createPinchState() { return { pinched: false, raw: false, pending: 0, kind: null }; }

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
