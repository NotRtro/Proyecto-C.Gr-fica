import { createInputPipeline } from "../js/input/pipeline.js";
import { frameToDetections } from "../js/input/recorder.js";
import { createPointerCore } from "../js/ui/pointerCore.js";
import { nearestIn } from "../js/ui/targeting.js";
import { hand, VIDEO, FRAME_MS } from "./synthetic.mjs";

const VIEW = { w: VIDEO.w, h: VIDEO.h };
const CLOSE_FRAMES = 4;

const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });
const inBox = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
const center = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function createMenu() {
  const orbTarget = { id: "orb" };
  const panelTarget = { id: "panel" };
  const orb = { id: "orb", action: "menu:toggle", r: box(48, 216, 188, 356), drag: orbTarget, round: true };
  const close = { id: "close", action: "menu:close", r: box(488, 212, 534, 258) };
  const folders = ["models", "tools", "view", "help", "settings"].map((id, i) =>
    ({ id, action: "menu:folder", r: box(214, 278 + i * 62, 534, 334 + i * 62) }));
  const exit = { id: "exit", action: "app:exit", hold: 1500, r: box(214, 588, 534, 648) };
  const panel = box(203, 199, 545, 661);
  const bar = box(204, 200, 544, 268);
  const state = { open: false };
  const rows = [close, ...folders, exit];

  const hitOrb = (x, y) => { const c = center(orb.r); return Math.hypot(x - c.x, y - c.y) <= 70; };
  const buttons = () => (state.open ? [orb, ...rows] : [orb]);
  const buttonAt = (x, y) => buttons().find((b) => (b.round ? hitOrb(x, y) : inBox(b.r, x, y))) || null;
  const inPanel = (x, y) => state.open && inBox(panel, x, y);

  const view = {
    buttonAt,
    candidateAt(x, y) {
      const b = buttonAt(x, y);
      if (b) return b;
      return inPanel(x, y) ? nearestIn(rows, x, y, (el) => el.r) : null;
    },
    dragAt(btn, x, y) {
      if (btn && btn.drag) return { target: btn.drag, left: btn.r.left, top: btn.r.top };
      if (!btn && inPanel(x, y) && inBox(bar, x, y)) return { target: panelTarget, left: panel.left, top: panel.top };
      return null;
    },
    rectOf: (el) => el.r,
    alive: (el) => el === orb || state.open,
    holdOf: (el) => el.hold || 0,
    dwellEnabled: () => state.dwell,
    dwellable: (el) => !!el && !el.hold,
    keyOf: (el) => el.id,
  };

  const log = [];
  const out = {
    fire(btn) {
      log.push({ e: "fire", id: btn.id });
      if (btn === orb) state.open = !state.open;
    },
    clear() {}, press() {}, lift() {}, progress() {}, move() {},
    dragStart(e) { log.push({ e: "drag", id: e.target.id }); },
    drop(target) { log.push({ e: "drop", id: target.id }); },
  };

  return { state, orb, folders, rows, panel, view, out, log, isUiAt: (x, y) => hitOrb(x, y) || inPanel(x, y) };
}

function blend(a, b, f) {
  return { label: a.label, lm: a.lm.map((p, i) => p.map((v, k) => v + (b.lm[i][k] - v) * f)) };
}

const OPEN_OFFSET = (() => {
  const h = hand("open", 0, 0);
  const px = (p) => ({ x: (1 - p[0]) * VIDEO.w, y: p[1] * VIDEO.h });
  const a = px(h.lm[4]), b = px(h.lm[8]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
})();

export function createBench({ seed = 1, tremor = 3, dwell = false, startOpen = false } = {}) {
  const rand = rng(seed);
  const menu = createMenu();
  menu.state.dwell = dwell;
  menu.state.open = startOpen;
  const core = createPointerCore(menu.view, menu.out);
  const pipe = createInputPipeline({
    hitTest: () => null,
    findItem: () => null,
    findExplodable: () => null,
    canRotate: () => false,
    isUiAt: menu.isUiAt,
    onMoved() {}, onGrab() {}, onTap() {},
    emit(e, p) {
      if (e === "cursor:pinch-start") core.pinchStart(p);
      else if (e === "cursor:pinch-end") core.pinchEnd(p);
    },
  });
  const video = { videoWidth: VIDEO.w, videoHeight: VIDEO.h };
  let t = 1000;
  let closed = 0;
  let pose = "open";
  let wx = 900, wy = 400;
  let phase = rand() * Math.PI * 2;

  function frame() {
    phase += 0.35;
    const nx = (rand() * 2 - 1) * tremor + Math.sin(phase) * tremor * 0.5;
    const ny = (rand() * 2 - 1) * tremor + Math.cos(phase * 0.8) * tremor * 0.5;
    const from = hand(pose, wx + nx, wy + ny);
    const h = closed > 0 ? blend(from, hand("pinch", wx + nx, wy + ny), closed / CLOSE_FRAMES) : from;
    let hands = pipe.step({ detections: frameToDetections({ hands: [h] }), video, now: t, view: VIEW });
    core.update(hands, t);
    hands = pipe.step({ detections: null, video, now: t + 16, view: VIEW });
    core.update(hands, t + 16);
    t += FRAME_MS;
  }

  const aimAt = (x, y) => ({ x: x - OPEN_OFFSET.x, y: y - OPEN_OFFSET.y });

  function moveTo(x, y, ms) {
    const goal = aimAt(x, y);
    const x0 = wx, y0 = wy;
    const n = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= n; i++) {
      const f = 1 - Math.pow(1 - i / n, 3);
      wx = x0 + (goal.x - x0) * f;
      wy = y0 + (goal.y - y0) * f;
      frame();
    }
  }

  function dragBy(dx, dy, ms) {
    const x0 = wx, y0 = wy;
    const n = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      wx = x0 + dx * f;
      wy = y0 + dy * f;
      frame();
    }
  }

  function wait(ms) { for (let i = 0; i < Math.round(ms / FRAME_MS); i++) frame(); }
  function close() {
    for (closed = 1; closed <= CLOSE_FRAMES; closed++) frame();
    pose = "pinch";
    closed = 0;
  }

  function open() {
    pose = "open";
    for (closed = CLOSE_FRAMES - 1; closed >= 0; closed--) frame();
    closed = 0;
  }
  function setPose(p) { pose = p; }
  function place(x, y) { const g = aimAt(x, y); wx = g.x; wy = g.y; }

  return { rand, menu, moveTo, dragBy, wait, close, open, setPose, place, frame };
}

const pick = (r, lo, hi) => lo + r() * (hi - lo);

function aimInside(b, rect, mx, my) {
  const c = center(rect);
  return { x: c.x + pick(b.rand, -mx, mx) * (rect.right - rect.left) / 2, y: c.y + pick(b.rand, -my, my) * (rect.bottom - rect.top) / 2 };
}

export function trialOpenMenu(seed, tremor) {
  const b = createBench({ seed, tremor });
  b.place(pick(b.rand, 600, 1000), pick(b.rand, 150, 550));
  b.wait(200);
  const a = aimInside(b, b.menu.orb.r, 0.45, 0.45);
  b.moveTo(a.x, a.y, pick(b.rand, 450, 800));
  b.wait(pick(b.rand, 150, 400));
  b.close();
  b.wait(pick(b.rand, 60, 350));
  b.open();
  b.wait(300);
  const fires = b.menu.log.filter((l) => l.e === "fire");
  const drags = b.menu.log.filter((l) => l.e === "drag");
  return { ok: fires.length === 1 && fires[0].id === "orb" && !drags.length && b.menu.state.open, log: b.menu.log };
}

export function trialPickRow(seed, tremor) {
  const b = createBench({ seed, tremor, startOpen: true });
  const target = b.menu.folders[Math.floor(b.rand() * b.menu.folders.length)];
  b.place(pick(b.rand, 250, 900), pick(b.rand, 150, 600));
  b.wait(200);
  const a = aimInside(b, target.r, 0.6, 0.5);
  b.moveTo(a.x, a.y, pick(b.rand, 450, 800));
  b.wait(pick(b.rand, 150, 400));
  b.close();
  b.wait(pick(b.rand, 60, 300));
  b.open();
  b.wait(300);
  const fires = b.menu.log.filter((l) => l.e === "fire");
  return { ok: fires.length === 1 && fires[0].id === target.id, target: target.id, log: b.menu.log };
}

export function trialClickOrDrag(seed, tremor, wantDrag) {
  const b = createBench({ seed, tremor });
  b.place(pick(b.rand, 500, 900), pick(b.rand, 200, 500));
  b.wait(200);
  const a = aimInside(b, b.menu.orb.r, 0.4, 0.4);
  b.moveTo(a.x, a.y, pick(b.rand, 450, 800));
  b.wait(pick(b.rand, 150, 300));
  b.close();
  if (wantDrag) {
    b.wait(pick(b.rand, 500, 800));
    const len = pick(b.rand, 150, 320), ang = pick(b.rand, -1, 1);
    b.dragBy(len * Math.cos(ang), len * Math.sin(ang), pick(b.rand, 350, 700));
    b.wait(150);
  } else {
    b.wait(pick(b.rand, 60, 550));
  }
  b.open();
  b.wait(300);
  const fired = b.menu.log.some((l) => l.e === "fire");
  const dropped = b.menu.log.some((l) => l.e === "drop");
  return { ok: wantDrag ? dropped && !fired : fired && !dropped, log: b.menu.log };
}

export function sweepMenu(seed, tremor, ms, { dwell = false } = {}) {
  const b = createBench({ seed, tremor, dwell, startOpen: true });
  const area = { left: 20, top: 180, right: 620, bottom: 680 };
  b.place(400, 400);
  let elapsed = 0;
  while (elapsed < ms) {
    if (b.rand() < 0.3) b.setPose(b.rand() < 0.5 ? "relaxed" : "open");
    const d = pick(b.rand, 250, 700);
    b.moveTo(pick(b.rand, area.left, area.right), pick(b.rand, area.top, area.bottom), d);
    const pause = dwell ? pick(b.rand, 0, 300) : pick(b.rand, 0, 1200);
    b.wait(pause);
    elapsed += d + pause;
  }
  return b.menu.log.filter((l) => l.e !== "drag");
}

export function rate(n, fn) {
  let ok = 0;
  const fails = [];
  for (let i = 1; i <= n; i++) {
    const r = fn(i);
    if (r.ok) ok++;
    else fails.push({ seed: i, ...r });
  }
  return { ok, n, rate: ok / n, fails };
}

if (process.argv[1] && process.argv[1].endsWith("menuBench.mjs")) {
  const N = 100;
  for (const tremor of [2, 4, 6, 8]) {
    const open = rate(N, (s) => trialOpenMenu(s, tremor));
    const row = rate(N, (s) => trialPickRow(s, tremor));
    const click = rate(N, (s) => trialClickOrDrag(s, tremor, false));
    const drag = rate(N, (s) => trialClickOrDrag(s, tremor, true));
    const sweep = sweepMenu(tremor, tremor, 120000).length;
    const sweepDwell = sweepMenu(tremor + 50, tremor, 120000, { dwell: true }).length;
    console.log("temblor " + tremor + " px | abrir " + open.ok + "/" + N + " | fila " + row.ok + "/" + N
      + " | clic " + click.ok + "/" + N + " | arrastre " + drag.ok + "/" + N
      + " | activaciones en 2 min: " + sweep + " (dwell: " + sweepDwell + ")");
  }
}
