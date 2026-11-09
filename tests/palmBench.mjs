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

export function createPalmBench({ seed = 1, tremor = 4, span = 110, model = true, menuOpen = false } = {}) {
  const rand = rng(seed);
  const scene = createScene(menuOpen);
  const pipe = createInputPipeline(scene.adapter);
  const video = { videoWidth: VIDEO.w, videoHeight: VIDEO.h };
  const k = span / 110;
  const h = { x: 900, y: 400, pose: "palm", roll: 0, phase: rand() * 6.28, visible: true };
  let t = 1000;

  function frame() {
    h.phase += 0.35;
    const nx = (rand() * 2 - 1) * tremor + Math.sin(h.phase) * tremor * 0.5;
    const ny = (rand() * 2 - 1) * tremor + Math.cos(h.phase * 0.8) * tremor * 0.5;
    const hands = h.visible
      ? [hand(h.pose, h.x - PALM_OFFSET.x * k + nx, h.y - PALM_OFFSET.y * k + ny, "Right", { span, roll: h.roll, model })]
      : [];
    pipe.step({ detections: frameToDetections({ hands }), video, now: t, view: VIEW });
    pipe.step({ detections: null, video, now: t + 16, view: VIEW });
    t += FRAME_MS;
  }

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

  return { rand, scene, h, wait, moveTo, frame, stops };
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

export function trialPalmOverMenu(seed, { span = 110, tremor = 4, model = true, holdMs = 2000 } = {}) {
  const b = createPalmBench({ seed, tremor, span, model, menuOpen: true });
  b.h.x = pick(b.rand, 650, 1000); b.h.y = pick(b.rand, 250, 450);
  b.h.pose = "open";
  b.wait(300);
  b.moveTo(pick(b.rand, 260, 490), pick(b.rand, 300, 600), pick(b.rand, 400, 700));
  b.h.pose = "palm";
  b.wait(holdMs);
  return { stops: b.stops() };
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
