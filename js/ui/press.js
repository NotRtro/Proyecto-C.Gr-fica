import { UI_PRESS } from "../core/config.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function clickTravel(source, spanPx) {
  if (source === "mouse" || !spanPx) return UI_PRESS.MOUSE_TRAVEL;
  return clamp(spanPx * UI_PRESS.TRAVEL_SPAN, UI_PRESS.TRAVEL_MIN, UI_PRESS.TRAVEL_MAX);
}

export function createPress({ source, spanPx, x, y, t, draggable = false, holdMs = 0 }) {
  return {
    source, draggable, holdMs, x0: x, y0: y, t0: t,
    limit: source === "mouse" ? UI_PRESS.MOUSE_TRAVEL : clickTravel(source, spanPx),
    travel: 0, state: "pressed", lift: null,
  };
}

export function stepPress(p, x, y, now) {
  if (p.state === "pressed") {
    p.travel = Math.max(p.travel, Math.hypot(x - p.x0, y - p.y0));
    if (p.holdMs) {
      if (p.travel > p.limit * 1.5) { p.state = "cancelled"; return "cancel"; }
      if (now - p.t0 >= p.holdMs) { p.state = "fired"; return "hold-fire"; }
      return null;
    }
    if (!p.draggable) return null;
    if (p.source === "mouse") {
      if (p.travel > p.limit) { p.state = "dragging"; return "drag-start"; }
      return null;
    }
    if (p.travel > p.limit) { p.state = "cancelled"; return "cancel"; }
    if (now - p.t0 >= UI_PRESS.HOLD_TO_DRAG_MS) { p.state = "lifted"; p.lift = { x, y }; return "lift"; }
    return null;
  }
  if (p.state === "lifted" && Math.hypot(x - p.lift.x, y - p.lift.y) > p.limit * 0.5) {
    p.state = "dragging";
    return "drag-start";
  }
  return null;
}

export function endPress(p, now, sameTarget) {
  if (p.state === "dragging") return "drop";
  if (p.state === "cancelled" || p.state === "fired" || p.holdMs) return "none";
  if (p.source === "mouse") return sameTarget ? "click" : "none";
  return now - p.t0 <= UI_PRESS.CLICK_MAX_MS && p.travel <= p.limit ? "click" : "none";
}

export function pressProgress(p, now) {
  if (p.state !== "pressed") return 0;
  if (p.holdMs) return Math.min(1, (now - p.t0) / p.holdMs);
  if (!p.draggable || p.source === "mouse") return 0;
  const f = Math.min(1, (now - p.t0) / UI_PRESS.HOLD_TO_DRAG_MS);
  return f >= UI_PRESS.SHOW_PROGRESS_FROM ? f : 0;
}
