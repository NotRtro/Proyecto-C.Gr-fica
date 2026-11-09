import { createInputPipeline } from "../js/input/pipeline.js";
import { frameToDetections } from "../js/input/recorder.js";
import { hand, VIDEO, FRAME_MS } from "./synthetic.mjs";
import { rng } from "./menuBench.mjs";

const VIEW = { w: VIDEO.w, h: VIDEO.h };
const CLOSE_FRAMES = 4;
const DEG = 180 / Math.PI;

function blend(a, b, f) {
  return { label: a.label, lm: a.lm.map((p, i) => p.map((v, k) => v + (b.lm[i][k] - v) * f)) };
}

function openOffset(span) {
  const h = hand("open", 0, 0, "Right", { span });
  const px = (p) => ({ x: (1 - p[0]) * VIDEO.w, y: p[1] * VIDEO.h });
  const a = px(h.lm[4]), b = px(h.lm[8]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function createScene(scale) {
  const item = { id: "holo", type: "holo", x: 640, y: 324, w: 480, h: 480, scale, ry: 0,
    explodeTarget: 0, rotatable: true, explodable: true };
  const events = [];
  const adapter = {
    hitTest(x, y) {
      const hw = (item.w * item.scale) / 2, hh = (item.h * item.scale) / 2;
      return Math.abs(x - item.x) <= hw && Math.abs(y - item.y) <= hh ? item : null;
    },
    boundsOf(it) {
      const hw = (it.w * it.scale) / 2, hh = (it.h * it.scale) / 2;
      return { left: it.x - hw, right: it.x + hw, top: it.y - hh, bottom: it.y + hh };
    },
    findItem: (id) => (id === item.id ? item : null),
    findExplodable: () => item,
    canRotate: () => true,
    onMoved() {}, onGrab() {}, onTap() {},
    emit(e) { events.push(e); },
  };
  return { item, events, adapter };
}

export function createTwoHandBench({ seed = 1, tremor = 4, span = 110, scale = 1 } = {}) {
  const rand = rng(seed);
  const scene = createScene(scale);
  const pipe = createInputPipeline(scene.adapter);
  const video = { videoWidth: VIDEO.w, videoHeight: VIDEO.h };
  const offset = openOffset(span);
  const hands = {
    L: { label: "Left", x: 300, y: 330, pose: "open", closed: 0, phase: rand() * 6.28 },
    R: { label: "Right", x: 980, y: 330, pose: "open", closed: 0, phase: rand() * 6.28 },
  };
  let t = 1000;

  function render(h) {
    h.phase += 0.35;
    const nx = (rand() * 2 - 1) * tremor + Math.sin(h.phase) * tremor * 0.5;
    const ny = (rand() * 2 - 1) * tremor + Math.cos(h.phase * 0.8) * tremor * 0.5;
    const px = h.x - offset.x + nx, py = h.y - offset.y + ny;
    const from = hand(h.pose, px, py, h.label, { span });
    if (!h.closed) return from;
    return blend(from, hand("pinch", px, py, h.label, { span }), h.closed / CLOSE_FRAMES);
  }

  function frame() {
    const dets = frameToDetections({ hands: [render(hands.L), render(hands.R)] });
    pipe.step({ detections: dets, video, now: t, view: VIEW });
    pipe.step({ detections: null, video, now: t + 16, view: VIEW });
    t += FRAME_MS;
  }

  function wait(ms) { for (let i = 0; i < Math.round(ms / FRAME_MS); i++) frame(); }

  function close(k) {
    const h = hands[k];
    for (h.closed = 1; h.closed <= CLOSE_FRAMES; h.closed++) frame();
    h.pose = "pinch"; h.closed = 0;
  }

  function open(k) {
    const h = hands[k];
    h.pose = "open";
    for (h.closed = CLOSE_FRAMES - 1; h.closed > 0; h.closed--) frame();
    h.closed = 0;
    frame();
  }

  function move(ms, path, each = () => {}) {
    const n = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= n; i++) {
      const p = path(i / n);
      if (p.L) Object.assign(hands.L, p.L);
      if (p.R) Object.assign(hands.R, p.R);
      frame();
      each();
    }
  }

  return { rand, scene, hands, wait, close, open, move, frame, session: () => scene.events.includes("twohand:start") };
}

const pick = (r, lo, hi) => lo + r() * (hi - lo);

function grabBoth(b, gap) {
  const { item } = b.scene;
  b.hands.L.x = item.x - gap / 2; b.hands.L.y = item.y + pick(b.rand, -20, 20);
  b.hands.R.x = item.x + gap / 2; b.hands.R.y = item.y + pick(b.rand, -20, 20);
  b.wait(300);
  b.close("L");
  b.wait(200);
  const pre = { scale: b.scene.item.scale, ry: b.scene.item.ry };
  b.close("R");
  return pre;
}

export function trialJoin(seed, { tremor = 4, scale = 1, outside = 0 } = {}) {
  const b = createTwoHandBench({ seed, tremor, scale });
  const { item } = b.scene;
  const half = (item.w * item.scale) / 2;
  b.hands.L.x = item.x - half * 0.4; b.hands.L.y = item.y;
  b.wait(300);
  b.close("L");
  b.wait(300);
  b.hands.R.x = item.x + half + outside + pick(b.rand, -20, 20);
  b.hands.R.y = item.y + pick(b.rand, -40, 40);
  b.wait(400);
  b.close("R");
  b.wait(300);
  return { ok: b.session() };
}

export function trialScaleOnly(seed, { tremor = 4, wobble = 0.08 } = {}) {
  const b = createTwoHandBench({ seed, tremor });
  const { item } = b.scene;
  const g0 = pick(b.rand, 220, 320), g1 = g0 * pick(b.rand, 1.4, 1.8);
  grabBoth(b, g0);
  b.wait(300);
  const ry0 = item.ry, s0 = item.scale, y0L = b.hands.L.y, y0R = b.hands.R.y;
  const w = (b.rand() < 0.5 ? -1 : 1) * wobble;
  let rot = 0;
  const cx = item.x;
  b.move(pick(b.rand, 600, 1000), (f) => {
    const g = g0 + (g1 - g0) * f, bend = Math.sin(f * Math.PI) * w * g;
    return { L: { x: cx - g / 2, y: y0L - bend / 2 }, R: { x: cx + g / 2, y: y0R + bend / 2 } };
  }, () => { rot = Math.max(rot, Math.abs(item.ry - ry0) * DEG); });
  b.wait(300);
  const want = g1 / g0;
  return { rotDeg: rot, lost: 1 - (item.scale / s0 - 1) / (want - 1), session: b.session() };
}

export function trialRotateOnly(seed, { tremor = 4, wobble = 0.1 } = {}) {
  const b = createTwoHandBench({ seed, tremor });
  const { item } = b.scene;
  const g0 = pick(b.rand, 240, 320), turn = (b.rand() < 0.5 ? -1 : 1) * pick(b.rand, 25, 50) / DEG;
  grabBoth(b, g0);
  b.wait(300);
  const s0 = item.scale, ry0 = item.ry;
  const cx = item.x, cy = item.y;
  const w = (b.rand() < 0.5 ? -1 : 1) * wobble;
  let err = 0;
  b.move(pick(b.rand, 700, 1100), (f) => {
    const a = turn * f, g = g0 * (1 + w * Math.sin(f * Math.PI));
    const dx = Math.cos(a) * g / 2, dy = Math.sin(a) * g / 2;
    return { L: { x: cx - dx, y: cy - dy }, R: { x: cx + dx, y: cy + dy } };
  }, () => { err = Math.max(err, Math.abs(item.scale / s0 - 1)); });
  b.wait(300);
  return { scaleErr: err, rotDeg: (item.ry - ry0) * DEG, wantDeg: turn * DEG, session: b.session() };
}

export function trialHoldStill(seed, { tremor = 4, ms = 2000 } = {}) {
  const b = createTwoHandBench({ seed, tremor });
  const { item } = b.scene;
  const pre = grabBoth(b, pick(b.rand, 220, 320));
  const ry0 = pre.ry, s0 = pre.scale;
  let rot = 0, sc = 0;
  for (let i = 0; i < Math.round(ms / FRAME_MS); i++) {
    b.frame();
    rot = Math.max(rot, Math.abs(item.ry - ry0) * DEG);
    sc = Math.max(sc, Math.abs(item.scale / s0 - 1));
  }
  return { rotDeg: rot, scaleErr: sc, session: b.session() };
}

export function trialHoldAfterMove(seed, { tremor = 4, ms = 1500 } = {}) {
  const b = createTwoHandBench({ seed, tremor });
  const { item } = b.scene;
  const g0 = pick(b.rand, 220, 300), g1 = g0 * pick(b.rand, 1.3, 1.6), turn = pick(b.rand, -30, 30) / DEG;
  grabBoth(b, g0);
  b.wait(300);
  const cx = item.x, cy = item.y;
  b.move(pick(b.rand, 600, 900), (f) => {
    const g = g0 + (g1 - g0) * f, a = turn * f;
    const dx = Math.cos(a) * g / 2, dy = Math.sin(a) * g / 2;
    return { L: { x: cx - dx, y: cy - dy }, R: { x: cx + dx, y: cy + dy } };
  });
  b.wait(400);
  const s0 = item.scale, ry0 = item.ry;
  let rot = 0, sc = 0;
  for (let i = 0; i < Math.round(ms / FRAME_MS); i++) {
    b.frame();
    rot = Math.max(rot, Math.abs(item.ry - ry0) * DEG);
    sc = Math.max(sc, Math.abs(item.scale / s0 - 1));
  }
  return { rotDeg: rot, scaleErr: sc, session: b.session() };
}

const quant = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function summary(n, fn, key) {
  const xs = [];
  for (let s = 1; s <= n; s++) xs.push(fn(s)[key]);
  return { median: quant(xs, 0.5), p90: quant(xs, 0.9), max: Math.max(...xs) };
}

if (process.argv[1] && process.argv[1].endsWith("twoHandBench.mjs")) {
  const N = 50;
  const f = (v, d = 1) => v.toFixed(d);
  console.log("unirse con la segunda mano (aciertos/" + N + "):");
  for (const scale of [0.3, 1, 2]) {
    const row = [0, 40, 80, 160].map((out) => {
      let ok = 0;
      for (let s = 1; s <= N; s++) if (trialJoin(s, { scale, outside: out }).ok) ok++;
      return out + " px fuera: " + ok;
    });
    console.log("  escala " + scale + " | " + row.join(" | "));
  }
  for (const tremor of [2, 4, 8]) {
    const jumpS = summary(N, (s) => trialHoldStill(s, { tremor }), "scaleErr");
    const jumpR = summary(N, (s) => trialHoldStill(s, { tremor }), "rotDeg");
    const after = summary(N, (s) => trialHoldAfterMove(s, { tremor }), "scaleErr");
    const sOnly = summary(N, (s) => trialScaleOnly(s, { tremor }), "rotDeg");
    const rOnly = summary(N, (s) => trialRotateOnly(s, { tremor }), "scaleErr");
    console.log("temblor " + tremor + " px | al unirse: escala p90 " + f(jumpS.p90 * 100) + " %, giro p90 " + f(jumpR.p90) + " grados"
      + " | quietas tras mover: escala p90 " + f(after.p90 * 100) + " %"
      + " | solo escalar: giro sin querer p90 " + f(sOnly.p90) + " grados"
      + " | solo girar: escala sin querer p90 " + f(rOnly.p90 * 100) + " %");
  }
}
