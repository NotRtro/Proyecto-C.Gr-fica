import { on, emit } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { runAction } from "./actions.js";
import { nearestIn, magnetPoint } from "./targeting.js";
import { createPointerCore } from "./pointerCore.js";

let hovered = new Set();
let lastUpdate = 0;

const SCROLL_EDGE_PX = 72;
const SCROLL_MAX_PX_S = 620;

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

function dragAt(btn, x, y) {
  const from = btn || document.elementFromPoint(x, y);
  const handle = from ? from.closest("[data-drag]") : null;
  const target = handle ? document.getElementById(handle.dataset.drag) : null;
  if (!target) return null;
  const r = target.getBoundingClientRect();
  return { target, left: r.left, top: r.top };
}

const view = {
  buttonAt,
  candidateAt,
  dragAt,
  rectOf,
  alive: (el) => el.isConnected && !el.disabled,
  holdOf: (el) => Number(el.dataset.hold) || 0,
  dwellEnabled: () => settings.dwellSelect,
  dwellable: (el, x, y) => !!el && !el.dataset.hold && !!el.closest("[data-ui]") && !menuScrollIntent(x, y),
  keyOf: (el) => el.dataset.action + "|" + (el.dataset.arg || ""),
};

function menuBodyAt(x, y) {
  if (!document.body.classList.contains("menu-open")) return null;
  const body = document.querySelector(".holo-body");
  if (!body || body.scrollHeight <= body.clientHeight) return null;
  const rect = body.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom ? { body, rect } : null;
}

function scrollStrength(y, rect) {
  const fromTop = y - rect.top;
  const fromBottom = rect.bottom - y;
  if (fromTop < SCROLL_EDGE_PX) return -(1 - fromTop / SCROLL_EDGE_PX);
  if (fromBottom < SCROLL_EDGE_PX) return 1 - fromBottom / SCROLL_EDGE_PX;
  return 0;
}

function menuScrollIntent(x, y) {
  const target = menuBodyAt(x, y);
  return !!target && scrollStrength(y, target.rect) !== 0;
}

function updateMenuScroll(hands, dt) {
  const body = document.querySelector(".holo-body");
  if (!body) return;
  let direction = 0;
  for (const hand of hands) {
    if (!hand.present || hand.removed || hand.pinched || hand.source !== "hand") continue;
    const target = menuBodyAt(hand.ax, hand.ay);
    if (!target) continue;
    const strength = scrollStrength(hand.ay, target.rect);
    if (Math.abs(strength) > Math.abs(direction)) direction = strength;
  }
  if (direction) body.scrollTop += direction * SCROLL_MAX_PX_S * dt;
  body.classList.toggle("scrolling-up", direction < 0);
  body.classList.toggle("scrolling-down", direction > 0);
}

function fire(btn, hand) {
  btn.classList.add("fired");
  setTimeout(() => btn.classList.remove("fired"), 180);
  emit("ui:click", { hand, action: btn.dataset.action });
  runAction(btn.dataset.action, btn.dataset.arg, btn);
}

function clear(e) {
  if (e.btn) { e.btn.classList.remove("pressed"); e.btn.style.removeProperty("--p"); }
  if (e.target) e.target.classList.remove("lifted", "dragging");
}

function move(e, h) {
  const t = e.target;
  const x = Math.max(0, Math.min(innerWidth - t.offsetWidth, h.ax - e.dx));
  const y = Math.max(0, Math.min(innerHeight - t.offsetHeight, h.ay - e.dy));
  t.style.left = x + "px";
  t.style.top = y + "px";
  emit("ui:drag", { id: t.id });
}

const core = createPointerCore(view, {
  fire,
  clear,
  move,
  press: (btn) => btn.classList.add("pressed"),
  lift: (e) => e.target.classList.add("lifted"),
  dragStart: (e) => {
    e.target.classList.add("lifted", "dragging");
    if (e.btn) e.btn.classList.remove("pressed");
  },
  progress: (btn, p) => btn.style.setProperty("--p", p.toFixed(3)),
  drop: (target) => emit("ui:dragged", { id: target.id }),
});

on("cursor:pinch-start", (ev) => core.pinchStart(ev));
on("cursor:pinch-end", (ev) => core.pinchEnd(ev));

export function updatePointer(hands, now) {
  const dt = lastUpdate ? Math.min(0.05, (now - lastUpdate) / 1000) : 0;
  lastUpdate = now;
  const next = core.update(hands, now);
  updateMenuScroll(hands, dt);
  for (const b of hovered) if (!next.has(b)) b.classList.remove("hover");
  for (const b of next) b.classList.add("hover");
  hovered = next;
}

export function holdProgressOf(hand) {
  return core.holdProgress(hand);
}

export function cursorDisplayPoint(h) {
  const el = core.focusOf(h.id);
  if (!el || !el.isConnected || !el.closest(".holo-panel")) return { x: h.x, y: h.y };
  return magnetPoint(h.x, h.y, rectOf(el));
}
