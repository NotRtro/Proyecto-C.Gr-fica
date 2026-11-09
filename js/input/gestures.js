import { midpoint } from "../core/util.js";
import { CURSOR_FILTER, PALM } from "../core/config.js";
import { toScreen } from "./coords.js";
import { createPointFilter, createAngleFilter } from "./filters.js";
import { pinchMetrics, createPinchState, stepPinch, pinchStrength } from "./recognizers/pinch.js";
import { palmMetrics, palmPose, createPalmState, stepPalm, resetPalm } from "./recognizers/palm.js";

export function createGestureEngine() {
  const per = new Map();
  let last = [];

  function snapshot(id, s, extra) {
    return {
      id, source: "hand", handedness: s.handedness, present: s.present,
      x: s.x, y: s.y, ax: s.ax, ay: s.ay, kx: s.kx, ky: s.ky, rawX: s.rawX, rawY: s.rawY, spanPx: s.spanPx,
      pinched: s.pinch.pinched, pinchChanged: null,
      removed: false, metrics: s.metrics, palm: s.palmOut, pinchStrength: s.strength || 0, ...extra,
    };
  }

  function update(tracks, video, now, view) {
    const out = [];
    const seen = new Set();
    for (const t of tracks) {
      seen.add(t.id);
      let s = per.get(t.id);
      if (!s) {
        s = { pinch: createPinchState(), filter: createPointFilter(CURSOR_FILTER),
          knuckleFilter: createPointFilter(CURSOR_FILTER), angleFilter: createAngleFilter(PALM.ANGLE_FILTER),
          palm: createPalmState(), palmOut: null, pinchEndT: -Infinity,
          x: 0, y: 0, ax: 0, ay: 0, kx: 0, ky: 0, rawX: 0, rawY: 0, spanPx: 0, metrics: null };
        per.set(t.id, s);
      }
      const reappeared = t.present && s.present === false;
      s.handedness = t.handedness;
      s.present = t.present;
      let change = null;
      if (t.present) {
        const m = pinchMetrics(t.lm, video, t.wl);
        m.gesture = t.gesture ? t.gesture.name : null;
        const pm = palmMetrics(t.lm, video, t.wl, t.gesture);
        if (!s.pinch.pinched && palmPose(s.palm.pose, pm) === "dial") {
          s.pinch.pending = 0; s.pinch.raw = false; s.pinch.kind = null;
        } else {
          change = stepPinch(s.pinch, m);
        }
        if (change === "end") s.pinchEndT = now;
        m.kind = s.pinch.kind;
        s.strength = pinchStrength(m);
        m.palm = pm;
        m.model = t.gesture;
        const raw = midpoint(toScreen(t.lm[8], video, view), toScreen(t.lm[4], video, view));
        if (change === "start" || reappeared) s.filter.reset();
        const pos = s.filter.filter(raw, now);
        s.rawX = raw.x; s.rawY = raw.y;
        s.spanPx = m.span * Math.max(view.w / video.videoWidth, view.h / video.videoHeight);
        s.x = pos.x; s.y = pos.y;
        if (reappeared) s.knuckleFilter.reset();
        const knuckle = s.knuckleFilter.filter(toScreen(t.lm[9], video, view), now);
        s.kx = knuckle.x; s.ky = knuckle.y;
        const releasing = (s.pinch.pinched && !s.pinch.raw) || change === "end";
        if (!releasing) { s.ax = pos.x; s.ay = pos.y; }
        s.metrics = m;
        s.palmOut = null;
        if (s.pinch.pinched || s.pinch.raw || now - s.pinchEndT < PALM.AFTER_PINCH_MS) {
          resetPalm(s.palm);
          s.angleFilter.reset();
        } else {
          const c = toScreen(t.lm[9], video, view);
          const k5 = toScreen(t.lm[5], video, view), k17 = toScreen(t.lm[17], video, view);
          const angle = s.angleFilter.filter(Math.atan2(k17.y - k5.y, k17.x - k5.x), now);
          const palm = stepPalm(s.palm, pm, now, c, s.spanPx, angle);
          s.palmOut = { ...palm, x: c.x, y: c.y };
        }
      } else {
        s.palmOut = null;
        resetPalm(s.palm);
        s.angleFilter.reset();
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

  function repeat() {
    return last.filter((h) => !h.removed)
      .map((h) => ({ ...h, pinchChanged: null, palm: h.palm && { ...h.palm, fired: false } }));
  }

  function reset() { per.clear(); last = []; }

  return { update, repeat, reset };
}
