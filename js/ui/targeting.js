import { UI_TARGET } from "../core/config.js";

function inside(r, x, y, pad = 0) {
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

export function stickyTarget(current, candidate, x, y, rectOf, margin = UI_TARGET.HYSTERESIS_PX) {
  if (candidate === current) return current;
  if (current && inside(rectOf(current), x, y, margin)) return current;
  return candidate || null;
}

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

export function magnetPoint(x, y, rect, k = UI_TARGET.MAGNET) {
  if (!rect) return { x, y };
  const cy = (rect.top + rect.bottom) / 2;
  return { x, y: y + (cy - y) * k };
}

export function createDwell() { return { key: null, t0: 0, x0: 0, y0: 0, fired: false }; }

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
