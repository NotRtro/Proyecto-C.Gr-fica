import { createInputPipeline } from "../js/input/pipeline.js";
import { frameToDetections } from "../js/input/recorder.js";
import { hand, VIDEO, FRAME_MS } from "./synthetic.mjs";
import { rng } from "./menuBench.mjs";

const VIEW = { w: VIDEO.w, h: VIDEO.h };
const CLOSE_FRAMES = 4;

function blend(a, b, f) {
  return { label: a.label, lm: a.lm.map((p, i) => p.map((v, k) => v + (b.lm[i][k] - v) * f)) };
}

function openOffset(span) {
  const h = hand("open", 0, 0, "Right", { span });
  const px = (p) => ({ x: (1 - p[0]) * VIDEO.w, y: p[1] * VIDEO.h });
  const a = px(h.lm[4]), b = px(h.lm[8]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function layout(radius, rand) {
  const parts = [];
  const gap = radius * 2 + Math.max(12, radius);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      parts.push({ id: parts.length, x: 520 + col * gap + (rand() - 0.5) * 6, y: 220 + row * gap + (rand() - 0.5) * 6, r: radius });
    }
  }
  return parts;
}

function createScene(parts) {
  const item = { id: "model", type: "model", x: 640, y: 360, w: 900, h: 600, scale: 1, ry: 0,
    explodeTarget: 2.2, rotatable: true, explodable: true };
  const events = [];
  const grabs = [];
  const adapter = {
    hitTest(x, y) {
      return Math.abs(x - item.x) <= item.w / 2 && Math.abs(y - item.y) <= item.h / 2 ? item : null;
    },
    pieceAt(x, y) {
      const p = parts.find((q) => Math.hypot(x - q.x, y - q.y) <= q.r);
      return p ? { item, part: p.id } : null;
    },
    beginPiece(it, part) { grabs.push(part); return true; },
    movePiece() {},
    endPiece() { return null; },
    findItem: (id) => (id === item.id ? item : null),
    findExplodable: () => item,
    canRotate: () => true,
    onMoved() {}, onGrab() {}, onTap() {},
    emit(e) { events.push(e); },
  };
  return { item, events, grabs, adapter };
}

export function trialPiece(seed, { radius = 15, span = 110, tremor = 4, aim = 0.5 } = {}) {
  const rand = rng(seed);
  const parts = layout(radius, rand);
  const scene = createScene(parts);
  const pipe = createInputPipeline(scene.adapter);
  const video = { videoWidth: VIDEO.w, videoHeight: VIDEO.h };
  const offset = openOffset(span);
  const target = parts[Math.floor(rand() * parts.length)];
  const h = { x: 300, y: 600, pose: "open", closed: 0, phase: rand() * 6.28 };
  let t = 1000;

  function frame() {
    h.phase += 0.35;
    const nx = (rand() * 2 - 1) * tremor + Math.sin(h.phase) * tremor * 0.5;
    const ny = (rand() * 2 - 1) * tremor + Math.cos(h.phase * 0.8) * tremor * 0.5;
    const px = h.x - offset.x + nx, py = h.y - offset.y + ny;
    const from = hand(h.pose, px, py, "Right", { span });
    const shot = h.closed ? blend(from, hand("pinch", px, py, "Right", { span }), h.closed / CLOSE_FRAMES) : from;
    pipe.step({ detections: frameToDetections({ hands: [shot] }), video, now: t, view: VIEW });
    pipe.step({ detections: null, video, now: t + 16, view: VIEW });
    t += FRAME_MS;
  }
  const wait = (ms) => { for (let i = 0; i < Math.round(ms / FRAME_MS); i++) frame(); };

  wait(200);
  const ang = rand() * Math.PI * 2, d = Math.sqrt(rand()) * radius * aim;
  const gx = target.x + Math.cos(ang) * d, gy = target.y + Math.sin(ang) * d;
  const x0 = h.x, y0 = h.y, n = Math.round((450 + rand() * 350) / FRAME_MS);
  for (let i = 1; i <= n; i++) {
    const f = 1 - Math.pow(1 - i / n, 3);
    h.x = x0 + (gx - x0) * f; h.y = y0 + (gy - y0) * f;
    frame();
  }
  wait(150 + rand() * 250);
  for (h.closed = 1; h.closed <= CLOSE_FRAMES; h.closed++) frame();
  h.pose = "pinch"; h.closed = 0;
  wait(200);
  const got = scene.grabs[0];
  return { ok: got === target.id, wrong: got !== undefined && got !== target.id, none: got === undefined };
}

if (process.argv[1] && process.argv[1].endsWith("pieceBench.mjs")) {
  const N = 60;
  for (const span of [60, 110, 200]) {
    const row = [8, 12, 20, 30].map((radius) => {
      let ok = 0, wrong = 0, none = 0;
      for (let s = 1; s <= N; s++) {
        const r = trialPiece(s, { radius, span, tremor: 4 * span / 110 });
        if (r.ok) ok++; else if (r.wrong) wrong++; else none++;
      }
      return "pieza r" + radius + ": " + ok + " bien, " + wrong + " otra, " + none + " nada";
    });
    console.log("mano " + span + " px | " + row.join(" | "));
  }
}
