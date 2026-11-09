import { createInputPipeline } from "../js/input/pipeline.js";
import { frameToDetections } from "../js/input/recorder.js";
import { hand, VIDEO, FRAME_MS } from "./synthetic.mjs";
import { rng } from "./menuBench.mjs";

const VIEW = { w: VIDEO.w, h: VIDEO.h };
const PANEL = { left: 203, top: 199, right: 545, bottom: 661 };
const inPanel = (x, y) => x >= PANEL.left && x <= PANEL.right && y >= PANEL.top && y <= PANEL.bottom;

function createScene(menuOpen) {
  const item = { id: "holo", type: "holo", x: 800, y: 324, w: 480, h: 480, scale: 1, ry: 0,
    explodeTarget: 0, rotatable: true, explodable: true };
  const events = [];
  const adapter = {
    hitTest(x, y) {
      return Math.abs(x - item.x) <= item.w / 2 && Math.abs(y - item.y) <= item.h / 2 ? item : null;
    },
    isUiAt: (x, y) => menuOpen && inPanel(x, y),
    findItem: (id) => (id === item.id ? item : null),
    findExplodable: () => item,
    canRotate: () => true,
    onMoved() {}, onGrab() {}, onTap() {},
    emit(e) { events.push(e); },
  };
  return { item, events, adapter };
}

const PALM_OFFSET = (() => {
  const h = hand("palm", 0, 0);
  return { x: (1 - h.lm[9][0]) * VIDEO.w, y: h.lm[9][1] * VIDEO.h };
})();

function jitterLandmarks(shot, rand, noise, span) {
  if (!noise) return shot;
  const n = () => (rand() * 2 - 1) * noise;
  const lm = shot.lm.map(([x, y, z]) => [x + n() / VIDEO.w, y + n() / VIDEO.h, z + n() / VIDEO.w]);
  const k = 0.09 / span;
  const wl = shot.wl && shot.wl.map(([x, y, z]) => [x + n() * k, y + n() * k, z + n() * k]);
  return { ...shot, lm, ...(wl ? { wl } : {}) };
}

export function createPalmBench({ seed = 1, tremor = 4, span = 110, model = true, menuOpen = false, noise = 0 } = {}) {
  const rand = rng(seed);
  const scene = createScene(menuOpen);
  const pipe = createInputPipeline(scene.adapter);
  const video = { videoWidth: VIDEO.w, videoHeight: VIDEO.h };
  const k = span / 110;
  const h = { x: 900, y: 400, pose: "palm", roll: 0, phase: rand() * 6.28, visible: true };
  let t = 1000, last = [];

  function frame() {
    h.phase += 0.35;
    const nx = (rand() * 2 - 1) * tremor + Math.sin(h.phase) * tremor * 0.5;
    const ny = (rand() * 2 - 1) * tremor + Math.cos(h.phase * 0.8) * tremor * 0.5;
    const hands = h.visible
      ? [jitterLandmarks(hand(h.pose, h.x - PALM_OFFSET.x * k + nx, h.y - PALM_OFFSET.y * k + ny, "Right", { span, roll: h.roll, model }), rand, noise, span)]
      : [];
    last = pipe.step({ detections: frameToDetections({ hands }), video, now: t, view: VIEW });
    pipe.step({ detections: null, video, now: t + 16, view: VIEW });
    t += FRAME_MS;
  }

  const palm = () => (last[0] && last[0].palm) || null;
  const wait = (ms) => { for (let i = 0; i < Math.round(ms / FRAME_MS); i++) frame(); };
  function moveTo(x, y, ms) {
    const x0 = h.x, y0 = h.y, n = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= n; i++) {
      const f = 1 - Math.pow(1 - i / n, 3);
      h.x = x0 + (x - x0) * f; h.y = y0 + (y - y0) * f;
      frame();
    }
  }
  const stops = () => scene.events.filter((e) => e === "palm:stop").length;
  const count = (name) => scene.events.filter((e) => e === name).length;

  return { rand, scene, h, wait, moveTo, frame, stops, count, palm };
}

const pick = (r, lo, hi) => lo + r() * (hi - lo);

export function trialStop(seed, { span = 110, tremor = 4, model = true, roll = 0, holdMs = 1200 } = {}) {
  const b = createPalmBench({ seed, tremor, span, model });
  b.h.visible = false;
  b.wait(200);
  b.h.x = pick(b.rand, 650, 1000); b.h.y = pick(b.rand, 250, 450); b.h.roll = roll;
  b.h.visible = true;
  b.wait(holdMs);
  return { ok: b.stops() === 1 };
}

export function trialPalmOverMenu(seed, { span = 110, tremor = 4, model = true, holdMs = 2000, pose = "palm" } = {}) {
  const b = createPalmBench({ seed, tremor, span, model, menuOpen: true });
  b.h.x = pick(b.rand, 650, 1000); b.h.y = pick(b.rand, 250, 450);
  b.h.pose = "open";
  b.wait(300);
  b.moveTo(pick(b.rand, 260, 490), pick(b.rand, 300, 600), pick(b.rand, 400, 700));
  b.h.pose = pose;
  b.wait(holdMs);
  return { stops: b.stops(), dials: b.count("palm:dial-start") };
}

export function trialDial(seed, { span = 110, tremor = 4, model = true, noise = 0, turn = 40 } = {}) {
  const b = createPalmBench({ seed, tremor, span, model, noise });
  const { item } = b.scene;
  b.h.visible = false;
  b.wait(200);
  b.h.x = pick(b.rand, 700, 950); b.h.y = pick(b.rand, 250, 450);
  b.h.pose = "dial"; b.h.roll = 0; b.h.visible = true;
  b.wait(400);
  const ry0 = item.ry;
  const n = Math.round(pick(b.rand, 600, 1000) / FRAME_MS);
  for (let i = 1; i <= n; i++) { b.h.roll = turn * i / n; b.frame(); }
  const atEnd = item.ry - ry0;
  b.wait(300);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < Math.round(1000 / FRAME_MS); i++) {
    b.frame();
    lo = Math.min(lo, item.ry); hi = Math.max(hi, item.ry);
  }
  const DEG = 180 / Math.PI;
  return {
    sessions: b.count("palm:dial-start"), ends: b.count("palm:dial-end"),
    turned: (item.ry - ry0) * DEG, jitter: (hi - lo) * DEG, lag: (item.ry - ry0 - atEnd) * DEG,
  };
}

export function trialStillDrift(seed, { span = 110, tremor = 4, model = true, noise = 0, holdMs = 1500 } = {}) {
  const b = createPalmBench({ seed, tremor, span, model, noise });
  b.h.visible = false;
  b.wait(200);
  b.h.x = pick(b.rand, 700, 950); b.h.y = pick(b.rand, 250, 450); b.h.visible = true;
  b.wait(300);
  const a0 = b.palm() ? b.palm().angle : 0;
  let drift = 0;
  for (let i = 0; i < Math.round(holdMs / FRAME_MS); i++) {
    b.frame();
    const p = b.palm();
    if (p) drift = Math.max(drift, Math.abs(Math.atan2(Math.sin(p.angle - a0), Math.cos(p.angle - a0))));
  }
  return { driftDeg: drift * 180 / Math.PI };
}

export function trialVolante(seed, { span = 110, tremor = 4, model = true, noise = 0, tilt = 40 } = {}) {
  const b = createPalmBench({ seed, tremor, span, model, noise });
  const { item } = b.scene;
  b.h.visible = false;
  b.wait(200);
  b.h.x = pick(b.rand, 700, 950); b.h.y = pick(b.rand, 250, 450); b.h.roll = 0; b.h.visible = true;
  b.wait(pick(b.rand, 150, 500));
  const ry0 = item.ry;
  let maxStep = 0, prev = item.ry;
  const n = Math.round(pick(b.rand, 600, 1000) / FRAME_MS);
  for (let i = 1; i <= n; i++) {
    b.h.roll = tilt * i / n; b.frame();
    maxStep = Math.max(maxStep, Math.abs(item.ry - prev)); prev = item.ry;
  }
  b.wait(500);
  const DEG = 180 / Math.PI;
  return { sessions: b.count("palm:dial-start"), stops: b.stops(), turned: (item.ry - ry0) * DEG, maxStepDeg: maxStep * DEG };
}

export function sweepPalm(seed, ms, { span = 110, tremor = 4, model = true, maxPause = 300 } = {}) {
  const b = createPalmBench({ seed, tremor, span, model });
  const area = { left: 600, top: 150, right: 1200, bottom: 600 };
  let x = 900, y = 400, elapsed = 0;
  b.h.x = x; b.h.y = y;
  b.h.pose = "open";
  b.wait(300);
  b.h.pose = "palm";
  while (elapsed < ms) {
    let nx, ny;
    do { nx = pick(b.rand, area.left, area.right); ny = pick(b.rand, area.top, area.bottom); }
    while (Math.hypot(nx - x, ny - y) < span);
    x = nx; y = ny;
    const d = pick(b.rand, 250, 700), pause = pick(b.rand, 0, maxPause);
    b.moveTo(x, y, d);
    b.wait(pause);
    elapsed += d + pause;
  }
  return b.stops();
}

if (process.argv[1] && process.argv[1].endsWith("palmBench.mjs")) {
  const N = 40;
  const count = (fn) => { let k = 0; for (let s = 1; s <= N; s++) if (fn(s)) k++; return k; };
  console.log("detener mostrando la palma quieta 1,2 s (aciertos/" + N + "):");
  for (const model of [true, false]) {
    for (const span of [60, 110, 200]) {
      const row = [0, 20, 30].map((roll) => "inclinada " + roll + " grados: "
        + count((s) => trialStop(s, { span, tremor: 4 * span / 110, model, roll }).ok));
      console.log("  " + (model ? "con modelo" : "sin modelo") + ", mano " + span + " px | " + row.join(" | "));
    }
  }
  console.log("palma quieta 2 s sobre el menu abierto (veces que se detuvo el modelo):");
  for (const model of [true, false]) {
    let total = 0;
    for (let s = 1; s <= N; s++) total += trialPalmOverMenu(s, { model }).stops;
    console.log("  " + (model ? "con modelo" : "sin modelo") + ": " + total + " en " + N + " intentos");
  }
  console.log("pasar la palma abierta 2 min sin detenerse (pausas de 300 ms como maximo):");
  for (const span of [60, 110, 200]) {
    let total = 0;
    for (let k = 0; k < 3; k++) total += sweepPalm(10 + k, 120000, { span, tremor: 4 * span / 110 });
    console.log("  mano " + span + " px: " + total + " activaciones en 6 min");
  }
}
