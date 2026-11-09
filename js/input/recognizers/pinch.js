import { dist } from "../../core/util.js";
import { PINCH, PINCH_CLOSED, PINCH_FEEDBACK } from "../../core/config.js";
import { toVideoPx } from "../coords.js";

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function fingerExtensions(P, d = dist) {
  const ext = (tip, mcp) => d(P[tip], P[0]) / Math.max(d(P[mcp], P[0]), 1e-6);
  return { f8: ext(8, 5), f12: ext(12, 9), f16: ext(16, 13), f20: ext(20, 17) };
}

export function pinchMetrics(lm, video, wl = null) {
  const P = lm.map((p) => toVideoPx(p, video));
  const span = dist(P[0], P[9]);
  const [Q, d] = wl ? [wl, dist3] : [P, dist];
  const ratio = d(Q[4], Q[8]) / Math.max(d(Q[0], Q[9]), 1e-6);
  const { f8, f12, f16, f20 } = fingerExtensions(Q, d);
  const backMean = (f12 + f16 + f20) / 3;
  return { ratio, arch: backMean - f8, backMean, span, f8, f12, f16, f20, is3d: !!wl };
}

export function pinchGates() {
  return {
    ratioEnter: PINCH.RATIO_ENTER, ratioHold: PINCH.RATIO_HOLD,
    archEnter: PINCH.ARCH_ENTER, archHold: PINCH.ARCH_HOLD,
    backEnter: PINCH.BACKMEAN_ENTER, backHold: PINCH.BACKMEAN_HOLD,
    f8Enter: PINCH_CLOSED.F8_ENTER, f8Hold: PINCH_CLOSED.F8_HOLD,
    closedEnterK: PINCH_CLOSED.RATIO_ENTER_K, closedHoldK: PINCH_CLOSED.RATIO_HOLD_K,
  };
}

export function pinchKind(wasPinched, m, g = pinchGates()) {
  const ok = wasPinched
    ? m.arch > g.archHold && m.backMean > g.backHold && m.ratio < g.ratioHold
    : m.arch > g.archEnter && m.backMean > g.backEnter && m.ratio < g.ratioEnter;
  if (ok) return "ok";
  const closed = wasPinched
    ? m.f8 > g.f8Hold && m.ratio < g.ratioHold * g.closedHoldK
    : m.f8 > g.f8Enter && m.ratio < g.ratioEnter * g.closedEnterK;
  return closed ? "closed" : null;
}

export function pinchFailure(m, g = pinchGates()) {
  if (pinchKind(false, m, g)) return null;
  if (m.ratio >= g.ratioEnter) return "gap";
  if (m.f8 > g.f8Enter) return "tips";
  return "shape";
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
