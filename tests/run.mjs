// Tests del motor de gestos, sin camara ni navegador:
//   node tests/run.mjs   (o: npm test)
//
// Cada grabacion de tests/recordings/ se reproduce por la MISMA tuberia que usa el
// tracker (hands.js -> gestures.js -> arbiter.js) sobre una escena falsa, y se
// verifica el resultado. Si faltan grabaciones: node tests/make-recordings.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInputPipeline } from "../js/input/pipeline.js";
import { frameToDetections } from "../js/input/recorder.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW = { w: 1280, h: 720 };
const DEG = Math.PI / 180;

// ---- escena falsa ---------------------------------------------------------

// Mismas posiciones y tamanos que el tracker en una ventana de 1280x720.
function makeScene({ card = false } = {}) {
  const items = [{ id: "holo", type: "holo", x: 640, y: 324, w: 480, h: 480, scale: 1, ry: 0,
    explodeTarget: 0, rotatable: true, explodable: true }];
  if (card) items.push({ id: "card", type: "card", x: 300, y: 200, w: 260, h: 100, scale: 1, ry: 0 });
  const events = [];
  const adapter = {
    hitTest(x, y) {
      for (const it of [...items].reverse()) {
        const hw = (it.w * it.scale) / 2, hh = (it.h * it.scale) / 2;
        if (Math.abs(x - it.x) <= hw && Math.abs(y - it.y) <= hh) return it;
      }
      return null;
    },
    findItem: (id) => items.find((i) => i.id === id) || null,
    findExplodable: () => items.find((i) => i.explodable) || null,
    canRotate: (i) => !!i.rotatable,
    onMoved() {},
    onGrab(i, on) { i.grabbed = on; },
    onTap(i) { i.taps = (i.taps || 0) + 1; },
    emit(e, p) { events.push({ e, ...p, item: p && p.item ? { ...p.item } : null }); },
  };
  const byId = (id) => items.find((i) => i.id === id);
  const count = (e) => events.filter((x) => x.e === e).length;
  return { items, events, adapter, byId, count };
}

// Reproduce una grabacion: un paso por frame de camara y uno intermedio sin
// camara nueva (el navegador corre a ~60 fps y la camara a ~30).
function play(rec, scene, onStep = () => {}) {
  const pipe = createInputPipeline(scene.adapter);
  const video = { videoWidth: rec.video.w, videoHeight: rec.video.h };
  const ids = new Set();
  const T0 = 1000;
  for (const f of rec.frames) {
    const hands = pipe.step({ detections: frameToDetections(f), video, now: T0 + f.t, view: VIEW });
    hands.forEach((h) => ids.add(h.id));
    onStep(pipe);
    pipe.step({ detections: null, video, now: T0 + f.t + 16, view: VIEW });
    onStep(pipe);
  }
  return { pipe, ids };
}

function loadRec(name) {
  const p = join(HERE, "recordings", name + ".json");
  if (!existsSync(p)) throw new Error("falta " + p + " (corre: node tests/make-recordings.mjs)");
  return JSON.parse(readFileSync(p, "utf8"));
}

// ---- mini framework -------------------------------------------------------

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FALLA " + name + "\n         " + e.message); }
}
function check(cond, msg) { if (!cond) throw new Error(msg); }
function near(actual, expected, tol, what) {
  check(Math.abs(actual - expected) <= tol,
    what + ": esperado " + expected.toFixed(3) + " +-" + tol + ", obtenido " + actual.toFixed(3));
}

// ---- tests con grabaciones ------------------------------------------------

console.log("gestos (grabaciones sinteticas):");

test("pinch_drag: agarra, arrastra +200px y suelta sin salto", () => {
  const s = makeScene();
  play(loadRec("pinch_drag"), s);
  const holo = s.byId("holo");
  check(s.count("grab:start") === 1 && s.count("grab:end") === 1, "debe haber 1 agarre y 1 soltar");
  near(holo.x, 840, 10, "x final del reactor");
  near(s.events.find((e) => e.e === "grab:end").item.x, holo.x, 2, "sin salto al soltar");
  check(s.count("cursor:tap") === 0, "un arrastre no es tap");
  check(!holo.grabbed, "al final no debe quedar agarrado");
});

test("tap: tap rapido cuenta aunque al soltar el pulgar salte el punto medio; pinch lento no", () => {
  const s = makeScene({ card: true });
  play(loadRec("tap"), s);
  const card = s.byId("card");
  check((card.taps || 0) === 1, "la tarjeta debe recibir exactamente 1 tap, recibio " + (card.taps || 0));
  check(s.count("cursor:tap") === 1, "debe emitirse 1 cursor:tap");
});

test("two_hand: escala x2, rota 20 grados (-3 de zona muerta) y la otra mano sigue arrastrando", () => {
  const s = makeScene();
  play(loadRec("two_hand"), s);
  check(s.count("twohand:start") === 1 && s.count("twohand:end") === 1, "una sesion a dos manos");
  const end = s.events.find((e) => e.e === "twohand:end").item;
  near(end.scale, 2.0, 0.08, "escala al terminar la sesion");
  near(end.ry, 17 * DEG, 1.5 * DEG, "rotacion al terminar la sesion (rad)");
  const holo = s.byId("holo");
  near(holo.x - end.x, 100, 12, "arrastre con la mano restante");
  near(holo.scale, end.scale, 0.001, "soltar una mano no cambia la escala");
  check(!holo.grabbed && !holo.manipulated, "al final queda libre");
});

test("explode_drag: arrastre horizontal en vacio explota y arma; vertical no hace nada", () => {
  const s = makeScene();
  let max = 0;
  play(loadRec("explode_drag"), s, () => { max = Math.max(max, s.byId("holo").explodeTarget); });
  near(max, 2.2, 0.001, "explode maximo");
  near(s.byId("holo").explodeTarget, 1.47, 0.12, "explode final (tras volver 160px)");
  check(s.count("explode:start") === 1, "un solo explode (el pinch vertical no cuenta)");
  check(s.count("grab:start") === 0, "no debe agarrar nada");
});

test("hand_swap: la etiqueta Left/Right alterna y la mano se pierde 100ms sin soltar el objeto", () => {
  const s = makeScene();
  const { ids } = play(loadRec("hand_swap"), s);
  check(ids.size === 1, "debe ser siempre la misma mano, IDs vistos: " + [...ids].join(","));
  check(s.count("cursor:pinch-start") === 1, "un solo pinch, hubo " + s.count("cursor:pinch-start"));
  check(s.count("grab:start") === 1 && s.count("grab:end") === 1, "1 agarre y 1 soltar");
  near(s.byId("holo").x, 840, 10, "x final del reactor");
});

test("palm: palma sostenida dispara 1 vez; palma corta no dispara", () => {
  const s = makeScene();
  play(loadRec("palm"), s);
  check(s.count("gesture:palm") === 1, "esperado 1 evento de palma, hubo " + s.count("gesture:palm"));
  check(s.count("cursor:pinch-start") === 0, "la palma no es pinch");
});

// ---- mouse (sin grabacion) --------------------------------------------------

console.log("mouse:");

function mouseState(x, y, pinched, pinchChanged = null) {
  return { id: "mouse", source: "mouse", handedness: "mouse", present: true, x, y, ax: x, ay: y,
    pinched, pinchChanged, palmProgress: 0, palmFired: false, removed: false, metrics: null };
}

test("mouse: arrastrar, click = tap, rueda = escala, Shift+rueda = rotar", () => {
  const s = makeScene({ card: true });
  const pipe = createInputPipeline(s.adapter);
  let t = 1000;
  const step = (m) => pipe.step({ detections: null, video: null, now: (t += 16), view: VIEW, extra: [m] });
  step(mouseState(600, 300, false));
  step(mouseState(600, 300, true, "start"));
  for (let i = 1; i <= 20; i++) step(mouseState(600 + i * 5, 300, true));
  for (let i = 0; i < 10; i++) step(mouseState(700, 300, true));
  step(mouseState(700, 300, false, "end"));
  near(s.byId("holo").x, 740, 3, "x del reactor tras arrastrar con mouse");

  step(mouseState(300, 200, true, "start"));
  step(mouseState(300, 200, false, "end"));
  check(s.byId("card").taps === 1, "click rapido sobre la tarjeta = 1 tap");

  pipe.arbiter.wheel(740, 324, -200, false);
  near(s.byId("holo").scale, Math.exp(0.3), 0.001, "escala con rueda");
  pipe.arbiter.wheel(740, 324, 100, true);
  near(s.byId("holo").ry, 0.4, 0.001, "rotacion con Shift+rueda");
  pipe.arbiter.wheel(300, 200, 100, true);
  check(s.byId("card").ry === 0, "una tarjeta no rota");
});

test("mouse: arrastre rapido en vacio (un solo frame) igual cuenta todo el recorrido para explode", () => {
  const s = makeScene();
  const pipe = createInputPipeline(s.adapter);
  let t = 1000;
  const step = (m) => pipe.step({ detections: null, video: null, now: (t += 16), view: VIEW, extra: [m] });
  step(mouseState(100, 640, true, "start"));
  step(mouseState(420, 640, true));
  step(mouseState(420, 640, false, "end"));
  near(s.byId("holo").explodeTarget, ((320 - 24) / 320) * 2.2, 0.001, "explode tras salto de 320px");
});

test("bloqueo (menu, fase 5): suelta lo agarrado y los taps no tocan la escena", () => {
  const s = makeScene({ card: true });
  const pipe = createInputPipeline(s.adapter);
  let t = 1000;
  const step = (m) => pipe.step({ detections: null, video: null, now: (t += 16), view: VIEW, extra: [m] });
  step(mouseState(600, 300, true, "start"));
  check(s.byId("holo").grabbed, "agarrado antes de bloquear");
  pipe.arbiter.setLocked(true);
  check(!s.byId("holo").grabbed, "bloquear suelta el objeto");
  check(pipe.arbiter.mode() === "LOCKED", "modo LOCKED");
  step(mouseState(650, 300, true));
  near(s.byId("holo").x, 640, 0.001, "bloqueado: el arrastre no mueve nada");
  step(mouseState(300, 200, false, "end"));
  step(mouseState(300, 200, true, "start"));
  step(mouseState(300, 200, false, "end"));
  check(!s.byId("card").taps, "bloqueado: el tap no llega a la tarjeta");
  check(s.events.filter((e) => e.e === "cursor:tap").length === 1, "pero si se emite cursor:tap (para el menu)");
});

console.log("\n" + passed + " ok, " + failed + " fallas");
process.exit(failed ? 1 : 0);
