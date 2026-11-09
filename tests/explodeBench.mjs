import { createInputPipeline } from "../js/input/pipeline.js";
import { frameToDetections } from "../js/input/recorder.js";
import { HOLO } from "../js/core/config.js";
import { hand, VIDEO, FRAME_MS } from "./synthetic.mjs";
import { rng } from "./menuBench.mjs";

const VIEW = { w: VIDEO.w, h: VIDEO.h };
const CLOSE_FRAMES = 4;

function blend(a, b, f) {
  return { label: a.label, lm: a.lm.map((p, i) => p.map((v, k) => v + (b.lm[i][k] - v) * f)) };
}

function createScene() {
  const item = { id: "holo", type: "holo", x: 640, y: 324, w: 480, h: 480, scale: 1, ry: 0,
    explodeTarget: 0, rotatable: true, explodable: true };
  const events = [];
  const adapter = {
    hitTest(x, y) {
      return Math.abs(x - item.x) <= item.w / 2 && Math.abs(y - item.y) <= item.h / 2 ? item : null;
    },
    findItem: (id) => (id === item.id ? item : null),
    findExplodable: () => item,
    canRotate: () => true,
    onMoved() {}, onGrab() {}, onTap() {},
    emit(e) { events.push(e); },
  };
  return { item, events, adapter };
}

function createDriver({ seed, tremor, span }) {
  const rand = rng(seed);
  const scene = createScene();
  const pipe = createInputPipeline(scene.adapter);
  const video = { videoWidth: VIDEO.w, videoHeight: VIDEO.h };
  const h = { x: 150, y: 400, pose: "open", closed: 0, phase: rand() * 6.28 };
  let t = 1000;

  function frame() {
    h.phase += 0.35;
    const nx = (rand() * 2 - 1) * tremor + Math.sin(h.phase) * tremor * 0.5;
    const ny = (rand() * 2 - 1) * tremor + Math.cos(h.phase * 0.8) * tremor * 0.5;
    const from = hand(h.pose, h.x + nx, h.y + ny, "Right", { span });
    const shot = h.closed ? blend(from, hand("pinch", h.x + nx, h.y + ny, "Right", { span }), h.closed / CLOSE_FRAMES) : from;
    pipe.step({ detections: frameToDetections({ hands: [shot] }), video, now: t, view: VIEW });
    pipe.step({ detections: null, video, now: t + 16, view: VIEW });
    t += FRAME_MS;
  }

  const wait = (ms) => { for (let i = 0; i < Math.round(ms / FRAME_MS); i++) frame(); };
  function close() { for (h.closed = 1; h.closed <= CLOSE_FRAMES; h.closed++) frame(); h.pose = "pinch"; h.closed = 0; }
  function open() { h.pose = "open"; for (h.closed = CLOSE_FRAMES - 1; h.closed > 0; h.closed--) frame(); h.closed = 0; frame(); }
  function moveBy(dx, dy, ms) {
    const x0 = h.x, y0 = h.y, n = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= n; i++) { h.x = x0 + dx * i / n; h.y = y0 + dy * i / n; frame(); }
  }

  return { rand, scene, h, wait, close, open, moveBy };
}

const pick = (r, lo, hi) => lo + r() * (hi - lo);

export function trialEmptyTap(seed, { span = 110, tremor = 4 } = {}) {
  const d = createDriver({ seed, tremor, span });
  d.h.x = pick(d.rand, 80, 260); d.h.y = pick(d.rand, 150, 600);
  d.wait(300);
  d.close();
  d.wait(pick(d.rand, 30, 120));
  d.open();
  d.wait(200);
  const ev = d.scene.events;
  return { ok: ev.includes("cursor:tap") && !ev.includes("explode:start"), exploded: ev.includes("explode:start") };
}

export function trialExplodeDrag(seed, { span = 110, tremor = 4, hands = 2 } = {}) {
  const d = createDriver({ seed, tremor, span });
  d.h.x = pick(d.rand, 80, 200); d.h.y = pick(d.rand, 200, 560);
  d.wait(300);
  d.close();
  d.wait(150);
  d.moveBy(hands * span, pick(d.rand, -0.1, 0.1) * hands * span, pick(d.rand, 500, 800));
  d.wait(200);
  const reached = d.scene.item.explodeTarget / HOLO.EXPLODE_OUT;
  d.open();
  return { reached, started: d.scene.events.includes("explode:start") };
}

export function trialVerticalDrag(seed, { span = 110, tremor = 4 } = {}) {
  const d = createDriver({ seed, tremor, span });
  d.h.x = pick(d.rand, 80, 260); d.h.y = pick(d.rand, 150, 300);
  d.wait(300);
  d.close();
  d.wait(150);
  d.moveBy(pick(d.rand, -0.2, 0.2) * span, 2 * span, pick(d.rand, 400, 700));
  d.open();
  return { ok: !d.scene.events.includes("explode:start") };
}

if (process.argv[1] && process.argv[1].endsWith("explodeBench.mjs")) {
  const N = 50;
  for (const span of [60, 110, 200, 260]) {
    const row = [];
    for (const base of [4, 8]) {
      const tremor = base * span / 110;
      let taps = 0, wrong = 0, vert = 0;
      for (let s = 1; s <= N; s++) {
        const r = trialEmptyTap(s, { span, tremor });
        if (r.ok) taps++;
        if (r.exploded) wrong++;
        if (trialVerticalDrag(s, { span, tremor }).ok) vert++;
      }
      const reach = [];
      for (let s = 1; s <= 20; s++) reach.push(trialExplodeDrag(s, { span, tremor }).reached);
      reach.sort((a, b) => a - b);
      row.push("temblor " + tremor.toFixed(1) + ": tap " + taps + "/" + N + " (desarma " + wrong + ") | vertical ok " + vert
        + " | 2 manos de arrastre = " + Math.round(reach[10] * 100) + " % desarmado");
    }
    console.log("mano " + span + " px | " + row.join(" || "));
  }
}
