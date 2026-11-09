import { dist } from "../../core/util.js";
import { PALM, PINCH } from "../../core/config.js";
import { toVideoPx } from "../coords.js";
import { fingerExtensions } from "./pinch.js";

const TIPS = [8, 12, 16, 20], MCPS = [5, 9, 13, 17];
const CHAINS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function worldMetrics(W) {
  let straight = 1, axis = 0;
  for (const [m, p, d, t] of CHAINS) {
    const path = dist3(W[m], W[p]) + dist3(W[p], W[d]) + dist3(W[d], W[t]);
    straight = Math.min(straight, dist3(W[m], W[t]) / Math.max(path, 1e-6));
    axis += Math.abs(W[t].z - W[m].z) / Math.max(dist3(W[m], W[t]), 1e-6);
  }
  return { straight, axis: axis / 4 };
}

export function palmMetrics(lm, video, wl = null, gesture = null) {
  const P = lm.map((p) => ({ ...toVideoPx(p, video), z: (p.z || 0) * video.videoWidth }));
  const span = Math.max(dist(P[0], P[9]), 1e-3);
  const palmW = Math.max(dist(P[5], P[17]), 1e-3);
  const { f8, f12, f16, f20 } = fingerExtensions(P);
  const ext2 = Math.min(f8, f12, f16, f20);
  const ext3 = TIPS.reduce((s, t, i) => s + dist3(P[t], P[0]) / Math.max(dist3(P[MCPS[i]], P[0]), 1e-3), 0) / 4;
  const depth = TIPS.reduce((s, t) => s + (P[0].z - P[t].z), 0) / 4 / palmW;
  const tilt = Math.abs(Math.atan2(P[9].x - P[0].x, P[0].y - P[9].y));
  const ratio = dist(P[4], P[8]) / span;
  const world = wl ? worldMetrics(wl) : null;
  const open = gesture ? gesture.name === "Open_Palm" && gesture.score >= PALM.MODEL_MIN : null;
  return { ext2, ext3, depth, tilt, ratio, span, world, open };
}

function pointsAtCamera(m, holding) {
  if (m.world) {
    return m.world.straight > PALM.STRAIGHT_MIN
      && m.world.axis > (holding ? PALM.DIAL_AXIS_HOLD : PALM.DIAL_AXIS_ENTER);
  }
  return m.depth > (holding ? PALM.DIAL_DEPTH_HOLD : PALM.DIAL_DEPTH_ENTER) && m.ext3 > PALM.DIAL_EXT3;
}

function isOpen(m, holding) {
  if (m.open !== null && m.open !== undefined) return m.open;
  if (m.world) return m.world.straight > PALM.STRAIGHT_MIN && m.world.axis < PALM.FLAT_AXIS_MAX;
  return m.ext2 > (holding ? PALM.STOP_EXT_HOLD : PALM.STOP_EXT_ENTER);
}

export function palmPose(prev, m, turn = PALM.TURN) {
  const hold = (pose) => prev === pose;
  if (m.ratio <= PINCH.RATIO_HOLD) return null;
  if (turn === "perilla" && pointsAtCamera(m, hold("dial"))) return "dial";
  const maxTilt = hold("stop") ? (turn === "volante" ? PALM.VOLANTE_TILT_HOLD : PALM.STOP_TILT_HOLD) : PALM.STOP_TILT_ENTER;
  return isOpen(m, hold("stop")) && m.tilt < maxTilt ? "stop" : null;
}

export function createPalmState() {
  return { pose: null, pending: 0, since: 0, anchor: null, fired: false, angle: 0, angle0: 0, turning: false };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function stepPalm(st, m, now, center, spanPx, angle, turn = PALM.TURN) {
  const raw = palmPose(st.pose, m, turn);
  if (raw === st.pose) st.pending = 0;
  else if (++st.pending >= PALM.CONFIRM_FRAMES) {
    st.pose = raw; st.pending = 0;
    st.since = now; st.anchor = { ...center }; st.fired = false;
    st.angle0 = angle; st.turning = false;
  }
  if (raw === st.pose) st.angle = angle;
  if (turn === "volante" && st.pose === "stop" && Math.abs(wrap(st.angle - st.angle0)) > PALM.VOLANTE_START) {
    st.turning = true;
  }
  let progress = 0, fired = false;
  if (st.pose === "stop" && !st.turning) {
    if (dist(center, st.anchor) > PALM.STILL_SPAN * spanPx) { st.since = now; st.anchor = { ...center }; }
    progress = Math.min(1, (now - st.since) / PALM.STOP_MS);
    if (progress >= 1 && !st.fired) { st.fired = true; fired = true; }
    if (st.fired) progress = 0;
  }
  const pose = st.pose === "stop" && st.turning ? "dial" : st.pose;
  return { pose, progress, fired, angle: st.angle, angle0: st.angle0 };
}

export function resetPalm(st) { st.pose = null; st.pending = 0; st.fired = false; st.turning = false; }
