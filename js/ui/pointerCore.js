import { UI_TARGET } from "../core/config.js";
import { createPress, stepPress, endPress, pressProgress } from "./press.js";
import { stickyTarget, pickIntent, createDwell, stepDwell, dwellProgress } from "./targeting.js";

export function createPointerCore(view, out) {
  const presses = new Map();
  const aims = new Map();
  let clock = 0;

  function pinchTarget(hand, x, y, source) {
    if (source === "mouse") return view.buttonAt(x, y);
    const a = aims.get(hand);
    const intent = a ? pickIntent(a.history, clock) : null;
    if (intent && view.alive(intent)) return intent;
    return view.candidateAt(x, y);
  }

  function pinchStart({ hand, x, y, source, spanPx }) {
    const old = presses.get(hand);
    if (old) { out.clear(old); presses.delete(hand); }
    const btn = pinchTarget(hand, x, y, source);
    const drag = view.dragAt(btn, x, y);
    if (!btn && !drag) return;
    const p = createPress({ source, spanPx, x, y, t: clock, draggable: !!drag, holdMs: btn ? view.holdOf(btn) : 0 });
    const e = { p, btn, target: drag ? drag.target : null, dx: drag ? x - drag.left : 0, dy: drag ? y - drag.top : 0 };
    presses.set(hand, e);
    if (btn) out.press(btn);
  }

  function pinchEnd({ hand, x, y, removed }) {
    const e = presses.get(hand);
    if (!e) return;
    presses.delete(hand);
    const result = removed ? "none" : endPress(e.p, clock, view.buttonAt(x, y) === e.btn);
    out.clear(e);
    if (result === "click" && e.btn && view.alive(e.btn)) out.fire(e.btn, hand);
    else if (result === "drop") out.drop(e.target);
  }

  function updateAim(h, now) {
    let a = aims.get(h.id);
    if (!a) { a = { current: null, history: [], dwell: createDwell() }; aims.set(h.id, a); }
    const cand = view.candidateAt(h.ax, h.ay);
    const cur = a.current && view.alive(a.current) ? a.current : null;
    a.current = h.source === "mouse" ? cand : stickyTarget(cur, cand, h.ax, h.ay, view.rectOf);
    a.history.push({ t: now, el: a.current });
    while (a.history.length && a.history[0].t < now - UI_TARGET.HISTORY_MS) a.history.shift();
    return a.current;
  }

  function updateDwell(h, cur, now) {
    const d = aims.get(h.id).dwell;
    const active = view.dwellEnabled() && h.source === "hand" && !h.pinched && !presses.has(h.id);
    const el = active && view.dwellable(cur, h.ax, h.ay) ? cur : null;
    if (stepDwell(d, el ? view.keyOf(el) : null, h.ax, h.ay, now)) out.fire(el, h.id);
  }

  function update(hands, now) {
    clock = now;
    const hovered = new Set();
    const alive = new Set();
    for (const h of hands) {
      if (!h.present) continue;
      alive.add(h.id);
      const cur = updateAim(h, now);
      if (cur) hovered.add(cur);
      const e = presses.get(h.id);
      if (e && h.pinched) {
        const ev = stepPress(e.p, h.ax, h.ay, now);
        if (ev === "lift") out.lift(e);
        else if (ev === "drag-start") out.dragStart(e);
        else if (ev === "cancel") out.clear(e);
        else if (ev === "hold-fire") { out.clear(e); out.fire(e.btn, h.id); }
        if (e.p.state === "dragging") out.move(e, h);
        if (e.btn && e.p.holdMs) out.progress(e.btn, pressProgress(e.p, now));
      }
      updateDwell(h, cur, now);
    }
    for (const id of aims.keys()) if (!alive.has(id)) aims.delete(id);
    return hovered;
  }

  function holdProgress(hand) {
    const e = presses.get(hand);
    if (e) return pressProgress(e.p, clock);
    const a = aims.get(hand);
    const dw = a ? dwellProgress(a.dwell, clock) : 0;
    return dw >= UI_TARGET.DWELL_SHOW_FROM ? dw : 0;
  }

  function focusOf(hand) {
    const e = presses.get(hand);
    return (e && e.btn) || (aims.get(hand) || {}).current || null;
  }

  return { pinchStart, pinchEnd, update, holdProgress, focusOf };
}
