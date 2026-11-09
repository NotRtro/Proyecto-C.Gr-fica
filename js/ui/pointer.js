import { on, emit } from "../core/bus.js";
import { UI_TARGET } from "../core/config.js";
import { settings } from "../core/settings.js";
import { runAction } from "./actions.js";
import { createPress, stepPress, endPress, pressProgress } from "./press.js";
import { stickyTarget, nearestIn, pickIntent, magnetPoint, createDwell, stepDwell, dwellProgress } from "./targeting.js";

const presses = new Map();
const aims = new Map();
let hovered = new Set();
let clock = performance.now();

const rectOf = (el) => el.getBoundingClientRect();

export function buttonAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const btn = el ? el.closest("[data-action]") : null;
  return btn && !btn.disabled ? btn : null;
}

function candidateAt(x, y) {
  const top = document.elementFromPoint(x, y);
  if (!top) return null;
  const btn = top.closest("[data-action]");
  if (btn && !btn.disabled) return btn;
  const panel = top.closest(".holo-panel");
  return panel ? nearestIn([...panel.querySelectorAll("[data-action]:not([disabled])")], x, y, rectOf) : null;
}

function fire(btn, hand) {
  btn.classList.add("fired");
  setTimeout(() => btn.classList.remove("fired"), 180);
  emit("ui:click", { hand, action: btn.dataset.action });
  runAction(btn.dataset.action, btn.dataset.arg, btn);
}

function actionKey(el) { return el ? el.dataset.action + "|" + (el.dataset.arg || "") : null; }

function dwellable(el) { return !!el && !el.dataset.hold && !!el.closest("[data-ui]"); }

function clearVisuals(e) {
  if (e.btn) { e.btn.classList.remove("pressed"); e.btn.style.removeProperty("--p"); }
  if (e.target) e.target.classList.remove("lifted", "dragging");
}

function pinchTarget(hand, x, y, source) {
  if (source === "mouse") return buttonAt(x, y);
  const a = aims.get(hand);
  const intent = a ? pickIntent(a.history, clock) : null;
  if (intent && intent.isConnected && !intent.disabled) return intent;
  return candidateAt(x, y);
}

on("cursor:pinch-start", ({ hand, x, y, source, spanPx }) => {
  const old = presses.get(hand);
  if (old) { clearVisuals(old); presses.delete(hand); }
  const btn = pinchTarget(hand, x, y, source);
  const from = btn || document.elementFromPoint(x, y);
  const handle = from ? from.closest("[data-drag]") : null;
  const target = handle ? document.getElementById(handle.dataset.drag) : null;
  if (!btn && !target) return;
  const p = createPress({ source, spanPx, x, y, t: clock,
    draggable: !!target, holdMs: btn ? Number(btn.dataset.hold) || 0 : 0 });
  const r = target ? target.getBoundingClientRect() : null;
  presses.set(hand, { p, btn, target, dx: r ? x - r.left : 0, dy: r ? y - r.top : 0 });
  if (btn) btn.classList.add("pressed");
});

on("cursor:pinch-end", ({ hand, x, y, removed }) => {
  const e = presses.get(hand);
  if (!e) return;
  presses.delete(hand);
  const result = removed ? "none" : endPress(e.p, clock, buttonAt(x, y) === e.btn);
  clearVisuals(e);
  if (result === "click" && e.btn && e.btn.isConnected) fire(e.btn, hand);
  else if (result === "drop") emit("ui:dragged", { id: e.target.id });
});

function moveTarget(e, h) {
  const t = e.target;
  const x = Math.max(0, Math.min(innerWidth - t.offsetWidth, h.ax - e.dx));
  const y = Math.max(0, Math.min(innerHeight - t.offsetHeight, h.ay - e.dy));
  t.style.left = x + "px";
  t.style.top = y + "px";
  emit("ui:drag", { id: t.id });
}

function updateAim(h, now) {
  let a = aims.get(h.id);
  if (!a) { a = { current: null, history: [], dwell: createDwell() }; aims.set(h.id, a); }
  const cand = candidateAt(h.ax, h.ay);
  const cur = a.current && a.current.isConnected ? a.current : null;
  a.current = h.source === "mouse" ? cand : stickyTarget(cur, cand, h.ax, h.ay, rectOf);
  a.history.push({ t: now, el: a.current });
  while (a.history.length && a.history[0].t < now - UI_TARGET.HISTORY_MS) a.history.shift();
  return a.current;
}

function updateDwell(h, cur, now) {
  const d = aims.get(h.id).dwell;
  const active = settings.dwellSelect && h.source === "hand" && !h.pinched && !presses.has(h.id);
  const el = active && dwellable(cur) ? cur : null;
  if (stepDwell(d, actionKey(el), h.ax, h.ay, now)) fire(el, h.id);
}

export function updatePointer(hands, now) {
  clock = now;
  const next = new Set();
  const alive = new Set();
  for (const h of hands) {
    if (!h.present) continue;
    alive.add(h.id);
    const cur = updateAim(h, now);
    if (cur) next.add(cur);
    const e = presses.get(h.id);
    if (e && h.pinched) {
      const ev = stepPress(e.p, h.ax, h.ay, now);
      if (ev === "lift") e.target.classList.add("lifted");
      else if (ev === "drag-start") {
        e.target.classList.add("lifted", "dragging");
        if (e.btn) e.btn.classList.remove("pressed");
      } else if (ev === "cancel") clearVisuals(e);
      else if (ev === "hold-fire") { clearVisuals(e); fire(e.btn, h.id); }
      if (e.p.state === "dragging") moveTarget(e, h);
      if (e.btn && e.p.holdMs) e.btn.style.setProperty("--p", pressProgress(e.p, now).toFixed(3));
    }
    updateDwell(h, cur, now);
  }
  for (const id of aims.keys()) if (!alive.has(id)) aims.delete(id);
  for (const b of hovered) if (!next.has(b)) b.classList.remove("hover");
  for (const b of next) b.classList.add("hover");
  hovered = next;
}

export function holdProgressOf(hand) {
  const e = presses.get(hand);
  if (e) return pressProgress(e.p, clock);
  const a = aims.get(hand);
  const dw = a ? dwellProgress(a.dwell, clock) : 0;
  return dw >= UI_TARGET.DWELL_SHOW_FROM ? dw : 0;
}

export function cursorDisplayPoint(h) {
  const e = presses.get(h.id);
  const el = (e && e.btn) || (aims.get(h.id) || {}).current;
  if (!el || !el.isConnected || !el.closest(".holo-panel")) return { x: h.x, y: h.y };
  return magnetPoint(h.x, h.y, rectOf(el));
}
