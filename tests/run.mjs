import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInputPipeline } from "../js/input/pipeline.js";
import { tapTravel } from "../js/input/arbiter.js";
import { pinchStrength, pinchGates, pinchKind, pinchFailure } from "../js/input/recognizers/pinch.js";
import { frameToDetections } from "../js/input/recorder.js";
import { createPointFilter } from "../js/input/filters.js";
import { CURSOR_FILTER, PINCH, UI_TARGET, UI_PRESS, TAP, EXPLODE_DRAG, HOLO, PALM } from "../js/core/config.js";
import { createPress, stepPress, endPress, clickTravel } from "../js/ui/press.js";
import { stickyTarget, nearestIn, pickIntent, magnetPoint, createDwell, stepDwell } from "../js/ui/targeting.js";
import { analyzeHand, minCutoffFor, fitPinchGates, fistModelStats } from "../js/input/calibration.js";
import { createHandTracker } from "../js/input/hands.js";
import { createGestureEngine } from "../js/input/gestures.js";
import { hand } from "./synthetic.mjs";
import { setSetting } from "../js/core/settings.js";
import { samplesFromRecording } from "./calibrate.mjs";
import { rng, rate, trialOpenMenu, trialPickRow, trialClickOrDrag, trialDwell, trialHold, sweepMenu } from "./menuBench.mjs";
import { trialJoin, trialHoldStill, trialHoldAfterMove, summary } from "./twoHandBench.mjs";
import { trialEmptyTap, trialExplodeDrag, trialVerticalDrag } from "./explodeBench.mjs";
import { trialStop, trialPalmOverMenu, sweepPalm, trialDial, trialStillDrift, trialVolante } from "./palmBench.mjs";
import { trialPiece } from "./pieceBench.mjs";
import { explodePlan, partFactor } from "../js/three/explodePlan.js";
import { hasOwnLook } from "../js/three/modelLook.js";
import {
  findPieces, prettyName, screenToNdc, screenToNdcClamped, groupPieces, shouldSnap, manifestPathFor,
  guideOrder, createGuide, guideExpected, guideCanSnap, guideAdvance,
} from "../js/three/pieces.js";
import { PIECES } from "../js/core/config.js";
import { entriesInFolder } from "../js/net/catalog.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW = { w: 1280, h: 720 };
const DEG = Math.PI / 180;

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
    boundsOf(it) {
      const hw = (it.w * it.scale) / 2, hh = (it.h * it.scale) / 2;
      return { left: it.x - hw, right: it.x + hw, top: it.y - hh, bottom: it.y + hh };
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

test("catalogo: una carpeta muestra sus GLB directos y sus subcarpetas", () => {
  const list = [
    { name: "Corazón", folder: "organos" },
    { name: "Ojo", folder: "organos" },
    { name: "Detalle", folder: "organos/cabeza" },
    { name: "Cuerpo", folder: "general" },
  ];
  const root = entriesInFolder(list);
  check(root.folders.join() === "general,organos" && root.models.length === 0, "raíz por carpetas");
  const organs = entriesInFolder(list, "organos");
  check(organs.models.length === 2 && organs.folders.join() === "cabeza", "contenido directo de organos");
});

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

test("palm: la palma quieta detiene el giro UNA vez y no dispara pinch ni tap", () => {
  const s = makeScene();
  play(loadRec("palm"), s);
  const other = s.events.filter((e) => !e.e.startsWith("palm:"));
  check(other.length === 0, "no deberia haber otros eventos, hubo: " + other.map((e) => e.e).join(","));
  check(s.count("palm:stop") === 1, "un solo palm:stop, hubo " + s.count("palm:stop"));
  check(s.byId("holo").spinPaused === true, "el giro queda detenido");
});

test("palm_stop: moviendose no dispara; quieta detiene; otra vez reanuda", () => {
  const s = makeScene();
  play(loadRec("palm_stop"), s);
  const stops = s.events.filter((e) => e.e === "palm:stop").map((e) => e.paused);
  check(stops.join(",") === "true,false", "detener y reanudar, hubo: " + stops.join(","));
  check(s.count("cursor:pinch-start") === 0, "ningun pinch");
});

test("palm_dial: dedos a la camara + girar la muneca 40 grados gira el modelo ~36 (zona muerta 4)", () => {
  const s = makeScene();
  play(loadRec("palm_dial"), s);
  check(s.count("palm:dial-start") === 1 && s.count("palm:dial-end") === 1, "una sesion de perilla");
  near(s.byId("holo").ry, 36 * DEG, 2 * DEG, "giro del modelo (rad)");
  check(s.byId("holo").spinPaused === true, "girar a mano deja el modelo quieto");
  check(s.count("cursor:pinch-start") === 0, "la perilla no es pinch");
});

test("palm_negative: soltar un pinch abriendo la mano y un puno hacia la camara no son palma", () => {
  const s = makeScene();
  play(loadRec("palm_negative"), s);
  check(s.count("palm:stop") === 0 && s.count("palm:dial-start") === 0,
    "ningun gesto de palma, hubo: " + s.events.filter((e) => e.e.startsWith("palm:")).map((e) => e.e).join(","));
  check(s.count("cursor:pinch-start") === 1, "el pinch del principio si cuenta");
});

test("pinch_closed: pinch con medio, anular y menique recogidos agarra y arrastra", () => {
  const s = makeScene();
  play(loadRec("pinch_closed"), s);
  check(s.count("grab:start") === 1 && s.count("grab:end") === 1, "debe haber 1 agarre y 1 soltar");
  near(s.byId("holo").x, 840, 10, "x final del reactor");
  check(!s.byId("holo").grabbed, "al final no debe quedar agarrado");
});

test("pinch_mixed: un pinch OK que se cierra a mitad del arrastre no se suelta", () => {
  const s = makeScene();
  play(loadRec("pinch_mixed"), s);
  check(s.count("cursor:pinch-start") === 1, "un solo pinch, hubo " + s.count("cursor:pinch-start"));
  check(s.count("grab:start") === 1 && s.count("grab:end") === 1, "1 agarre y 1 soltar");
  near(s.byId("holo").x, 828, 12, "x final del reactor");
});

test("fist: un puno sobre el reactor no es pinch (ni el apretado con el pulgar en la punta)", () => {
  const s = makeScene();
  play(loadRec("fist"), s);
  check(s.events.length === 0, "no deberia haber eventos, hubo: " + s.events.map((e) => e.e).join(","));
});

console.log("mouse:");

function mouseState(x, y, pinched, pinchChanged = null) {
  return { id: "mouse", source: "mouse", handedness: "mouse", present: true, x, y, ax: x, ay: y,
    pinched, pinchChanged, removed: false, metrics: null };
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

test("tap: el movimiento permitido es relativo al tamano de la mano (mouse fijo)", () => {
  near(tapTravel("hand", 110), 26.4, 1e-9, "mano de las pruebas: igual que el valor fijo anterior (26 px)");
  near(tapTravel("hand", 60), 14.4, 1e-9, "mano lejos (chica en pantalla): menos px");
  check(tapTravel("hand", 400) === 60 && tapTravel("hand", 20) === 12, "acotado entre 12 y 60 px");
  check(tapTravel("mouse", 110) === 26 && tapTravel("hand", 0) === 26, "mouse o sin tamano: 26 px");
});

test("tap: con la mano lejos un pinch que se movio no es tap; con la mano cerca el temblor no lo arruina", () => {
  const run = (spanPx, movePx) => {
    const s = makeScene({ card: true });
    const pipe = createInputPipeline(s.adapter);
    let t = 1000;
    const h = (x, pinched, change = null) => ({ ...mouseState(x, 200, pinched, change), id: "h1", source: "hand", spanPx });
    const step = (state) => pipe.step({ detections: null, video: null, now: (t += 33), view: VIEW, extra: [state] });
    step(h(250, false));
    step(h(250, true, "start"));
    for (let i = 1; i <= 4; i++) step(h(250 + (movePx * i) / 4, true));
    step(h(250 + movePx, false, "end"));
    return s.byId("card").taps || 0;
  };
  check(run(60, 20) === 0, "mano lejos (60 px) que se movio 20 px: no es tap (antes si)");
  check(run(60, 10) === 1, "mano lejos quieta: tap");
  check(run(200, 35) === 1, "mano cerca (200 px) con 35 px de temblor: sigue siendo tap (antes no)");
  check(run(200, 60) === 0, "mano cerca que se movio 60 px: no es tap");
});

test("mouse: arrastre rapido en vacio (un solo frame) igual cuenta todo el recorrido para explode", () => {
  const s = makeScene();
  const pipe = createInputPipeline(s.adapter);
  let t = 1000;
  const step = (m) => pipe.step({ detections: null, video: null, now: (t += 16), view: VIEW, extra: [m] });
  step(mouseState(100, 640, true, "start"));
  step(mouseState(420, 640, true));
  step(mouseState(420, 640, false, "end"));
  const full = EXPLODE_DRAG.MOUSE_FULL;
  near(s.byId("holo").explodeTarget, ((full - TAP.MOUSE_PX) / full) * HOLO.EXPLODE_OUT, 0.001, "explode tras salto de 320px");
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

test("interfaz encima: un pinch sobre el menu no agarra ni explota lo de atras", () => {
  const s = makeScene();
  s.adapter.isUiAt = (x) => x >= 600;
  const pipe = createInputPipeline(s.adapter);
  let t = 1000;
  const step = (m) => pipe.step({ detections: null, video: null, now: (t += 16), view: VIEW, extra: [m] });
  step(mouseState(700, 300, true, "start"));
  for (let i = 1; i <= 10; i++) step(mouseState(700 + i * 30, 300, true));
  step(mouseState(1000, 300, false, "end"));
  near(s.byId("holo").x, 640, 0.001, "el reactor no se movio");
  check(s.byId("holo").explodeTarget === 0, "tampoco se exploto");
  const end = s.events.find((e) => e.e === "cursor:pinch-end");
  check(end && end.x === 1000 && end.y === 300, "pinch-end trae la posicion (para los botones)");
});

console.log("interfaz (docs/14, paso A):");

function simulatePress({ ms, path = () => ({ x: 0, y: 0 }), jitter = 0, draggable = false,
  holdMs = 0, source = "hand", spanPx = 110, seed = 1 }) {
  const rand = rng(seed);
  const p = createPress({ source, spanPx, x: 0, y: 0, t: 0, draggable, holdMs });
  const events = [];
  for (let t = 16; t <= ms; t += 16) {
    const q = path(t);
    const ev = stepPress(p, q.x + (rand() * 2 - 1) * jitter, q.y + (rand() * 2 - 1) * jitter, t);
    if (ev) events.push(ev);
  }
  return { events, result: endPress(p, ms, true), p };
}

test("grab rapido sobre el orbe = click aunque la mano tiemble 20 px (antes: se tomaba como arrastre)", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = simulatePress({ ms: 250, jitter: 20, draggable: true, seed });
    check(r.result === "click", "semilla " + seed + ": esperado click, obtenido " + r.result + " " + r.events.join(","));
  }
});

test("grab lento (550 ms) sin moverse sigue siendo click", () => {
  const r = simulatePress({ ms: 550, jitter: 10, draggable: true });
  check(r.events.includes("lift"), "se levanto (feedback) pero...");
  check(r.result === "click", "...al soltar sin moverse antes de 700 ms es click: " + r.result);
});

test("mantener 0.45 s y mover = arrastre del orbe (no click)", () => {
  const r = simulatePress({ ms: 1200, jitter: 8, draggable: true,
    path: (t) => ({ x: t > 500 ? (t - 500) * 0.4 : 0, y: 0 }) });
  check(r.events.join(",") === "lift,drag-start", "eventos: " + r.events.join(","));
  check(r.result === "drop", "resultado: " + r.result);
});

test("moverse sin esperar a levantar = cancelar (ni click ni arrastre)", () => {
  const r = simulatePress({ ms: 400, draggable: true, path: (t) => ({ x: t * 0.5, y: 0 }) });
  check(r.events.includes("cancel") && r.result === "none", r.events.join(",") + " -> " + r.result);
});

test("fila del menu: click aunque al soltar el cursor quede fuera del boton", () => {
  const p = createPress({ source: "hand", spanPx: 110, x: 0, y: 0, t: 0 });
  stepPress(p, 14, 9, 150);
  check(endPress(p, 300, false) === "click", "la mano no necesita soltar exactamente sobre el boton");
});

test("fila del menu: un grab de mas de 700 ms no es click", () => {
  const r = simulatePress({ ms: 900, jitter: 5 });
  check(r.result === "none", "resultado: " + r.result);
});

test("el umbral de click es relativo al tamano de la mano (30-70 px)", () => {
  near(clickTravel("hand", 110), 55, 0.001, "mano a distancia normal");
  near(clickTravel("hand", 40), 30, 0.001, "mano lejos (minimo)");
  near(clickTravel("hand", 300), 70, 0.001, "mano muy cerca (maximo)");
  near(clickTravel("mouse"), 8, 0.001, "mouse");
});

test("Salir: mantener 1.5 s dispara; soltar antes o alejarse cancela", () => {
  check(simulatePress({ ms: 1600, holdMs: 1500, jitter: 15 }).events.includes("hold-fire"), "mantenido completo");
  const early = simulatePress({ ms: 800, holdMs: 1500, jitter: 15 });
  check(!early.events.includes("hold-fire") && early.result === "none", "soltado antes");
  const away = simulatePress({ ms: 1600, holdMs: 1500, path: (t) => ({ x: t * 0.2, y: 0 }) });
  check(away.events.includes("cancel") && !away.events.includes("hold-fire"), "alejandose: " + away.events.join(","));
});

test("mouse: arrastre inmediato y click normal", () => {
  const drag = simulatePress({ ms: 200, source: "mouse", draggable: true, path: (t) => ({ x: t * 0.2, y: 0 }) });
  check(drag.events[0] === "drag-start" && drag.result === "drop", drag.events.join(",") + " -> " + drag.result);
  check(simulatePress({ ms: 900, source: "mouse", draggable: true }).result === "click", "click largo del mouse");
});

test("filtro One Euro: quita la mayor parte del temblor y sigue rapido a la mano", () => {
  let rawErr = 0, filtErr = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const rand = rng(seed);
    const g = createPointFilter(CURSOR_FILTER);
    for (let t = 0; t <= 2000; t += 33) {
      const raw = { x: 500 + (rand() * 2 - 1) * 8, y: 300 + (rand() * 2 - 1) * 8 };
      const q = g.filter(raw, t);
      if (t > 500) { rawErr += Math.hypot(raw.x - 500, raw.y - 300); filtErr += Math.hypot(q.x - 500, q.y - 300); n++; }
    }
  }
  check(filtErr / n < 0.45 * (rawErr / n), "temblor filtrado " + (filtErr / n).toFixed(2) + " px vs crudo " + (rawErr / n).toFixed(2) + " px");
  const f = createPointFilter(CURSOR_FILTER);
  for (let t = 0; t <= 2000; t += 33) f.filter({ x: 500, y: 300 }, t);
  let q = null;
  for (let t = 2033; t <= 2400; t += 33) {
    const x = 500 + Math.min(1, (t - 2033) / 200) * 300;
    q = f.filter({ x, y: 300 }, t);
  }
  check(Math.abs(q.x - 800) < 25, "retraso tras moverse: " + Math.abs(q.x - 800).toFixed(1) + " px");
});

console.log("interfaz (docs/14, paso B):");

const ROW_A = { id: "A", r: { left: 100, right: 420, top: 100, bottom: 156 } };
const ROW_B = { id: "B", r: { left: 100, right: 420, top: 162, bottom: 218 } };
const ROWS = [ROW_A, ROW_B];
const rectOfRow = (el) => el.r;
const candidate = (x, y) => nearestIn(ROWS, x, y, rectOfRow);

test("resaltado sin parpadeo: temblor de +-6 px en el borde entre dos filas", () => {
  const rand = rng(11);
  let naiveSwitches = 0, stickySwitches = 0, prevNaive = null, cur = null, prevSticky = null;
  for (let i = 0; i < 90; i++) {
    const x = 260, y = 159 + (rand() * 2 - 1) * 6;
    const c = candidate(x, y);
    if (prevNaive && c !== prevNaive) naiveSwitches++;
    prevNaive = c;
    cur = stickyTarget(cur, c, x, y, rectOfRow);
    if (prevSticky && cur !== prevSticky) stickySwitches++;
    prevSticky = cur;
  }
  check(naiveSwitches > 10, "sin histeresis deberia parpadear (hubo " + naiveSwitches + " cambios)");
  check(stickySwitches === 0, "con histeresis: " + stickySwitches + " cambios (esperado 0)");
});

test("el hueco entre filas cuenta como la fila mas cercana; fuera del panel no", () => {
  check(candidate(260, 158) === ROW_A && candidate(260, 161) === ROW_B, "hueco de 6 px");
  check(candidate(260, 300) === null, "lejos de las filas");
  check(candidate(40, 128) === null, "fuera del ancho del panel");
});

test("punto de intencion: se pulsa la fila apuntada ANTES de juntar los dedos (el cursor salto a la vecina)", () => {
  const rand = rng(12);
  const history = [];
  let cur = null, t = 0, y = 0;
  for (; t <= 600; t += 33) {
    y = 128 + (rand() * 2 - 1) * 5;
    cur = stickyTarget(cur, candidate(260, y), 260, y, rectOfRow);
    history.push({ t, el: cur });
  }
  for (let k = 1; k <= 4; k++, t += 33) {
    y = 128 + k * 10.5;
    cur = stickyTarget(cur, candidate(260, y), 260, y, rectOfRow);
    history.push({ t, el: cur });
  }
  const now = t;
  check(candidate(260, y) === ROW_B, "sin intencion se pulsaria B (el cursor quedo en y=" + y.toFixed(0) + ")");
  check(pickIntent(history, now) === ROW_A, "con intencion se pulsa A");
});

test("punto de intencion: si el usuario se paso de verdad a otra fila, se respeta", () => {
  const history = [];
  let t = 0;
  for (; t <= 600; t += 33) history.push({ t, el: ROW_A });
  for (; t <= 1000; t += 33) history.push({ t, el: ROW_B });
  check(pickIntent(history, t) === ROW_B, "apunto a B 400 ms antes del pinch");
});

test("cursor magnetico: se centra en la fila sin moverse en x", () => {
  const p = magnetPoint(250, 105, ROW_A.r);
  near(p.x, 250, 0.001, "x");
  near(p.y, 105 + (128 - 105) * 0.7, 0.001, "y");
});

console.log("interfaz (docs/14, paso C):");

function simulateDwell(samples) {
  const d = createDwell();
  const fires = [];
  samples.forEach(([key, x, y], i) => { if (stepDwell(d, key, x, y, i * 33)) fires.push(i * 33); });
  return fires;
}
const hold = (n, key, jitter = 0, seed = 3) => {
  const rand = rng(seed);
  return Array.from({ length: n }, () => [key, 200 + (rand() * 2 - 1) * jitter, 300 + (rand() * 2 - 1) * jitter]);
};

test("permanencia: 0.8 s quieto sobre un boton lo pulsa UNA vez (aunque siga encima)", () => {
  const fires = simulateDwell(hold(60, "menu:folder|view", 10));
  check(fires.length === 1, "disparos: " + fires.length);
  check(fires[0] >= 800 && fires[0] < 850, "a los " + fires[0] + " ms");
});

test("permanencia: moverse mas de 40 px reinicia el conteo", () => {
  const samples = [...hold(18, "a"), ...Array.from({ length: 5 }, (_, i) => ["a", 200 + i * 20, 300]), ...hold(10, "a")];
  check(simulateDwell(samples).length === 0, "no debe disparar: nunca estuvo 0.8 s quieto");
});

test("permanencia: salir y volver al boton permite pulsarlo de nuevo", () => {
  const fires = simulateDwell([...hold(30, "a"), ...hold(5, null), ...hold(30, "a")]);
  check(fires.length === 2, "disparos: " + fires.length);
});

test("permanencia: el menu re-dibujado (mismo boton, nodo nuevo) no dispara dos veces", () => {
  const fires = simulateDwell(hold(90, "menu:folder|view", 8));
  check(fires.length === 1, "disparos: " + fires.length);
});

console.log("calibracion (docs/14, paso D):");

test("calibracion: recupera los valores conocidos de la grabacion del protocolo", () => {
  const r = analyzeHand(samplesFromRecording(loadRec("calibration")));
  check(r.ok, "deberia calibrar: " + r.reason);
  near(r.ratioOpen, 0.707, 0.01, "ratio abierta");
  near(r.ratioPinch, 0.071, 0.01, "ratio en pinch");
  near(r.jumpPx, 35, 3, "salto al juntar los dedos (px)");
  near(r.spanPx, 110, 2, "tamano de la mano (px)");
  check(r.transitions >= 4, "pinch detectados: " + r.transitions);
  near(r.suggest.ratioEnter, 0.357, 0.01, "corte sugerido para entrar al pinch");
  check(r.suggest.ratioHold - r.suggest.ratioEnter >= 0.06, "mantener debe ser mas laxo que entrar");
});

test("calibracion: mide el temblor real y ajusta la histeresis", () => {
  const rand = rng(21), A = 6;
  const samples = [];
  let t = 0;
  for (let i = 0; i < 60; i++, t += 33) samples.push({ t, x: 500 + (rand() * 2 - 1) * A, y: 300 + (rand() * 2 - 1) * A, ratio: 0.7, span: 110 });
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < 8; i++, t += 33) samples.push({ t, x: 525, y: 275, ratio: 0.07, span: 110 });
    for (let i = 0; i < 8; i++, t += 33) samples.push({ t, x: 500, y: 300, ratio: 0.7, span: 110 });
  }
  const r = analyzeHand(samples);
  check(r.ok, r.reason);
  near(r.jitterPx, Math.sqrt(2 * A * A / 3), 0.9, "temblor medido (px)");
  check(r.suggest.hysteresisPx === Math.round(3 * r.jitterPx),
    "histeresis sugerida = 3 x temblor: " + r.suggest.hysteresisPx + " vs " + (3 * r.jitterPx).toFixed(1));
  check(r.suggest.hysteresisPx > 10, "con este temblor la histeresis debe subir sobre la de fabrica (10)");
});

test("calibracion: sin pinch de verdad no calibra (evita guardar umbrales absurdos)", () => {
  const r = analyzeHand(samplesFromRecording(loadRec("palm")));
  check(!r.ok && /pinch/.test(r.reason), "motivo: " + r.reason);
  check(!analyzeHand([]).ok, "sin muestras");
});

test("calibracion: mide el temblor sin filtrar y sugiere el suavizado del cursor", () => {
  const r = analyzeHand(samplesFromRecording(loadRec("calibration")));
  check(r.ok, r.reason);
  check(r.rawJitterPx > r.jitterPx, "el temblor crudo es mayor que el del cursor filtrado");
  near(r.frameMs, 33, 1, "intervalo entre frames de camara (ms)");
  near(r.suggest.minCutoff, minCutoffFor(r.rawJitterPx, r.frameMs), 1e-9, "minCutoff sugerido");
});

test("suavizado del cursor: el corte deja el temblor filtrado cerca del objetivo", () => {
  near(minCutoffFor(3, 33), 1.2, 0.05, "3 px de temblor a 30 fps = valor de fabrica");
  check(minCutoffFor(6, 33) < minCutoffFor(3, 33), "mas temblor, mas suavizado");
  check(minCutoffFor(0.5, 33) === 3 && minCutoffFor(60, 33) === 0.3, "acotado entre 0.3 y 3 Hz");
  const rand = rng(31), A = 5;
  const raw = Math.sqrt(2 * A * A / 3);
  const f = createPointFilter({ minCutoff: minCutoffFor(raw, 33), beta: 0, dCutoff: 1 });
  let err = 0, n = 0;
  for (let t = 0; t <= 6000; t += 33) {
    const q = f.filter({ x: 500 + (rand() * 2 - 1) * A, y: 300 + (rand() * 2 - 1) * A }, t);
    if (t > 1000) { err += (q.x - 500) ** 2 + (q.y - 300) ** 2; n++; }
  }
  near(Math.sqrt(err / n), 1.0, 0.3, "temblor filtrado (px)");
});

test("filtro: los cambios de parametros se aplican a las manos ya presentes", () => {
  const params = { minCutoff: 0.3, beta: 0, dCutoff: 1 };
  const f = createPointFilter(params);
  f.filter({ x: 0, y: 0 }, 0);
  const slow = f.filter({ x: 100, y: 0 }, 33).x;
  f.reset();
  params.minCutoff = 3;
  f.filter({ x: 0, y: 0 }, 0);
  check(f.filter({ x: 100, y: 0 }, 33).x > slow, "con mas corte el cursor sigue mas rapido");
});

test("seguimiento: si la mano reaparece tras perderse, el cursor no vuela desde la posicion vieja", () => {
  const tracker = createHandTracker(), engine = createGestureEngine();
  const video = { videoWidth: 1280, videoHeight: 720 }, view = { w: 1280, h: 720 };
  const step = (hands, t) => engine.update(tracker.update(frameToDetections({ hands }), t), video, t, view);
  let t = 0;
  for (let i = 0; i < 20; i++, t += 33) step([hand("open", 600, 300)], t);
  for (let i = 0; i < 3; i++, t += 33) step([], t);
  const h = step([hand("open", 760, 300)], t).find((s) => s.present);
  check(h && h.id === "h1", "es la misma mano");
  near(h.x, h.rawX, 1e-9, "el cursor parte de donde esta la mano");
});

const OK_PINCH = { ratio: 0.07, backMean: 1.8, arch: 0.7, f8: 1.1 };
const FIST = { ratio: 0.28, backMean: 0.88, arch: 0.13, f8: 0.75 };
const RELAXED = { ratio: 0.47, backMean: 1.38, arch: 0.13, f8: 1.25 };
const spread = (m, n, k) => Array.from({ length: n }, (_, i) => {
  const d = ((i % 5) - 2) * k;
  return { ...m, ratio: m.ratio + d * 0.1, backMean: m.backMean + d, arch: m.arch + d, f8: m.f8 + d };
});

test("calibracion del pinch: una mano promedio deja la forma de fabrica (no se arregla lo que anda)", () => {
  const r = analyzeHand(samplesFromRecording(loadRec("calibration")));
  check(r.ok, r.reason);
  near(r.pinchDetect, 1, 1e-9, "pinch reconocido");
  near(r.impostorRate, 0, 1e-9, "punos y mano relajada tomados por pinch");
  check(r.gatesChanged.length === 0, "forma sin cambios: " + r.gatesChanged.join());
  check(r.suggest.backEnter === 1.3 && r.suggest.f8Enter === 0.9, "valores de fabrica en la sugerencia");
});

test("calibracion del pinch: con el indice muy doblado relaja el corte del indice y el puno sigue rechazado", () => {
  const pinch = spread({ ratio: 0.07, backMean: 1.0, arch: -0.05, f8: 0.84 }, 40, 0.005);
  const impostors = [...spread(FIST, 30, 0.005), ...spread(RELAXED, 30, 0.005)];
  const base = pinchGates();
  check(pinch.every((m) => !pinchKind(false, m, base)), "con fabrica este pinch no se reconoce");
  const fit = fitPinchGates(pinch, impostors, base);
  check(fit.changed.includes("f8Enter"), "ajusta el corte del indice: " + fit.changed.join());
  check(fit.gates.f8Enter < 0.84, "el corte queda por debajo de este pinch: " + fit.gates.f8Enter);
  near(fit.detect, 1, 1e-9, "ahora se reconoce");
  near(fit.falseRate, 0, 1e-9, "y ninguna impostora pasa");
});

test("calibracion del pinch: si el puno toca la punta del indice, corta a mitad del hueco entre ambos", () => {
  const pinch = spread({ ratio: 0.07, backMean: 1.0, arch: -0.05, f8: 0.88 }, 40, 0.004);
  const tightFist = spread({ ratio: 0.07, backMean: 0.88, arch: 0.0, f8: 0.76 }, 30, 0.004);
  const fit = fitPinchGates(pinch, tightFist, pinchGates());
  check(fit.gates.f8Enter > 0.76 && fit.gates.f8Enter < 0.88, "corte entre el puno y el pinch: " + fit.gates.f8Enter);
  near(fit.falseRate, 0, 1e-9, "el puno apretado sigue rechazado");
  near(fit.detect, 1, 1e-9, "el pinch pasa");
});

test("calibracion del pinch: si la impostora es igual al pinch no toca nada y avisa", () => {
  const pinch = spread({ ratio: 0.07, backMean: 0.9, arch: 0.1, f8: 0.78 }, 40, 0.004);
  const fit = fitPinchGates(pinch, spread({ ratio: 0.07, backMean: 0.9, arch: 0.1, f8: 0.78 }, 30, 0.004), pinchGates());
  check(fit.changed.length === 0, "sin cambios: " + fit.changed.join());
  check(fit.detect < 0.5, "y el pinch sigue sin reconocerse: " + fit.detect);
});

test("diagnostico del pinch: dice que condicion falla", () => {
  check(pinchFailure(OK_PINCH) === null, "pinch correcto");
  check(pinchFailure({ ...OK_PINCH, ratio: 0.5 }) === "gap", "dedos separados");
  check(pinchFailure({ ratio: 0.3, backMean: 0.9, arch: -0.2, f8: 1.1 }) === "tips", "cerrado sin tocar las puntas");
  check(pinchFailure({ ratio: 0.07, backMean: 1.0, arch: -0.05, f8: 0.8 }) === "shape", "forma: ni estirados ni recogidos");
});

test("pinch cerrado: si las puntas no llegan a juntarse tanto, relaja su distancia sin dejar pasar impostoras", () => {
  const pinch = spread({ ratio: 0.25, backMean: 0.9, arch: -0.15, f8: 1.05 }, 40, 0.004);
  const impostors = [...spread(FIST, 30, 0.004), ...spread({ ...FIST, ratio: 0.07, f8: 0.76 }, 30, 0.004), ...spread(RELAXED, 30, 0.004)];
  const base = pinchGates();
  check(pinch.every((m) => !pinchKind(false, m, base)), "con fabrica (0.6 x 0.357 = 0.21) no pasa");
  const fit = fitPinchGates(pinch, impostors, base);
  check(fit.changed.includes("closedEnterK"), "ajusta la distancia del pinch cerrado: " + fit.changed.join());
  check(fit.gates.closedEnterK * base.ratioEnter > 0.25, "el corte queda por encima de este pinch");
  near(fit.detect, 1, 1e-9, "ahora se reconoce");
  near(fit.falseRate, 0, 1e-9, "puno, puno apretado y mano relajada siguen rechazados");
  check(fit.gates.closedHoldK * base.ratioHold >= fit.gates.closedEnterK * base.ratioEnter, "mantener es mas laxo que entrar");
});

test("detector de puno del modelo: solo se usa si distingue bien tu puno de tu pinch", () => {
  const tag = (n, model) => Array.from({ length: n }, () => ({ model }));
  const good = fistModelStats([...tag(40, "None")], [...tag(36, "Closed_Fist"), ...tag(4, "None")]);
  check(good.useful, "pinch nunca puno y puno 90 % puno: se usa");
  const confuses = fistModelStats([...tag(30, "None"), ...tag(10, "Closed_Fist")], tag(40, "Closed_Fist"));
  check(!confuses.useful, "si confunde tu pinch con un puno (25 %) no se usa");
  const blind = fistModelStats(tag(40, "None"), [...tag(20, "Closed_Fist"), ...tag(20, "None")]);
  check(!blind.useful, "si no reconoce tu puno (50 %) no se usa");
  check(fistModelStats([], tag(40, "Closed_Fist")) === null, "sin datos del modelo no decide");
});

test("detector de puno del modelo: bloquea el inicio de un pinch cerrado pero no suelta uno en curso", () => {
  const closedPinch = { ratio: 0.07, backMean: 0.9, arch: -0.2, f8: 1.1, gesture: "Closed_Fist" };
  const g = { ...pinchGates(), fistVeto: true };
  check(pinchKind(false, closedPinch, g) === null, "no empieza si el modelo ve un puno");
  check(pinchKind(true, closedPinch, g) === "closed", "pero no suelta un pinch que ya estaba");
  check(pinchKind(false, { ...closedPinch, gesture: "None" }, g) === "closed", "sin puno del modelo, pasa");
  check(pinchKind(false, closedPinch, pinchGates()) === "closed", "desactivado (fabrica), el modelo no influye");
  check(pinchFailure(closedPinch, g) === "fist", "el diagnostico lo explica");
});

test("calibracion: con datos del modelo decide si activa el detector de puno", () => {
  const samples = samplesFromRecording(loadRec("calibration"))
    .map((s) => ({ ...s, model: s.phase === "fist" ? "Closed_Fist" : "None" }));
  const r = analyzeHand(samples);
  check(r.ok, r.reason);
  near(r.modelFistAsFist, 1, 1e-9, "el modelo reconoce el puno");
  near(r.modelPinchAsFist, 0, 1e-9, "y no confunde el pinch");
  check(r.suggest.fistVeto === true, "se activa");
  check(analyzeHand(samplesFromRecording(loadRec("calibration"))).suggest.fistVeto === false, "sin modelo, no");
});

test("pinch en 3D: con los puntos en metros el pinch agarra y arrastra igual", () => {
  const s = makeScene();
  const pipe = createInputPipeline(s.adapter);
  const video = { videoWidth: 1280, videoHeight: 720 };
  let t = 1000;
  const step = (pose, x) => pipe.step({ detections: frameToDetections({ hands: [hand(pose, x, 300, "Right", { model: true })] }), video, now: (t += 33), view: VIEW });
  for (let i = 0; i < 8; i++) step("open", 600);
  for (let i = 0; i < 30; i++) step("pinch", 600 + (200 * i) / 29);
  for (let i = 0; i < 10; i++) step("pinch", 800);
  for (let i = 0; i < 10; i++) step("open", 800);
  check(s.count("grab:start") === 1 && s.count("grab:end") === 1, "un agarre y un soltar");
  near(s.byId("holo").x, 840, 12, "x final del reactor");
});

test("calibracion guardada: se aplica sobre los umbrales y la sensibilidad es relativa", () => {
  setSetting("calibration", { ratioEnter: 0.3, ratioHold: 0.4, hysteresisPx: 14, travelMinPx: 40, minCutoff: 0.8,
    archEnter: 0.1, archHold: 0.05, backEnter: 1.1, backHold: 1.0, f8Enter: 0.8, f8Hold: 0.7,
    closedEnterK: 0.7, closedHoldK: 0.8, fistVeto: true });
  check(pinchGates().closedEnterK === 0.7 && pinchGates().closedHoldK === 0.8 && pinchGates().fistVeto === true,
    "pinch cerrado calibrado");
  near(PINCH.RATIO_ENTER, 0.3, 1e-9, "pinch calibrado");
  check(pinchGates().backEnter === 1.1 && pinchGates().f8Enter === 0.8 && pinchGates().archHold === 0.05,
    "forma del pinch calibrada");
  near(CURSOR_FILTER.minCutoff, 0.8, 1e-9, "suavizado del cursor calibrado");
  check(UI_TARGET.HYSTERESIS_PX === 14 && UI_PRESS.TRAVEL_MIN === 40, "histeresis y recorrido calibrados");
  setSetting("pinchSensitivity", "high");
  near(PINCH.RATIO_ENTER, 0.37, 1e-9, "sensibilidad alta = calibrado + 0.07");
  setSetting("pinchSensitivity", "normal");
  setSetting("calibration", null);
  near(PINCH.RATIO_ENTER, 0.35, 1e-9, "de vuelta a fabrica");
  check(UI_TARGET.HYSTERESIS_PX === 10 && UI_PRESS.TRAVEL_MIN === 30, "de vuelta a fabrica");
  near(CURSOR_FILTER.minCutoff, 1.2, 1e-9, "suavizado de fabrica");
  check(pinchGates().backEnter === 1.3 && pinchGates().f8Enter === 0.9 && pinchGates().archEnter === 0.18,
    "forma de fabrica");
  check(pinchGates().closedEnterK === 0.6 && pinchGates().fistVeto === false, "pinch cerrado de fabrica");
});

console.log("modelos 3D (fase 6):");

test("explode: cada pieza sale en la direccion de su centro, las lejanas viajan mas", () => {
  const diag = 10;
  const plan = explodePlan([
    { center: [2, 0, 0], size: 3 },
    { center: [-4, 0, 0], size: 3 },
    { center: [0, 0, 0], size: 1 },
  ], diag, { spread: 0.9, push: 0.15 });
  near(plan[0].offset[0], 2 * 0.9 + 1.5, 1e-9, "pieza derecha: x");
  near(plan[1].offset[0], -(4 * 0.9 + 1.5), 1e-9, "pieza izquierda: sale hacia la izquierda y mas lejos");
  check(plan[0].offset[1] === 0 && plan[0].offset[2] === 0, "sin movimiento fuera de su direccion");
  near(plan[2].offset[1], 1.5, 1e-9, "la pieza del centro sale hacia arriba (push x diagonal)");
});

test("explode: las piezas grandes salen primero y las chicas despues", () => {
  const plan = explodePlan([
    { center: [1, 0, 0], size: 1 }, { center: [0, 1, 0], size: 9 }, { center: [0, 0, 1], size: 4 },
  ], 10, { maxLag: 0.5 });
  check(plan[1].lag === 0 && plan[0].lag === 0.5 && plan[2].lag === 0.25, "lags: " + plan.map((p) => p.lag).join(","));
});

test("explode: partFactor va de 0 a 1 con lag, suave y sin pasarse", () => {
  near(partFactor(0, 0.3), 0, 1e-9, "armado");
  near(partFactor(1, 0.3), 1, 1e-9, "explotado");
  near(partFactor(0.3, 0.3), 0, 1e-9, "todavia no empezo (lag)");
  let prev = 0;
  for (let f = 0; f <= 1.0001; f += 0.05) { const v = partFactor(f, 0.2); check(v >= prev - 1e-12, "monotono"); prev = v; }
  near(partFactor(1.5, 0), 1, 1e-9, "no se pasa de 1");
});

test("apariencia: con texturas o colores propios se ve original; sin nada, holografico", () => {
  const mat = (color, textured = false) => ({ textured, color });
  check(!hasOwnLook([]), "sin materiales -> holografico");
  check(!hasOwnLook([mat([1, 1, 1])]), "solo el blanco por defecto de GLTFLoader -> holografico");
  check(!hasOwnLook([mat([0.8, 0.8, 0.8]), mat([0.8, 0.8, 0.8])]), "todo el gris de fabrica de Blender -> holografico");
  check(hasOwnLook([mat([1, 1, 1], true)]), "con textura -> original");
  check(hasOwnLook([mat([0.54, 0.25, 0.25]), mat([0.4, 0.4, 0.4]), mat([1, 1, 1])]), "Buggy -> original");
  check(hasOwnLook([mat([0.9, 0.9, 0.9]), mat([0.1, 0.1, 0.1])]), "blanco y negro -> original");
});

console.log("gemelo digital (fase 7):");

const N = (name, mesh, ...children) => ({ name, mesh, children });
const names = (list) => list.map((n) => n.name).join(",");

test("piezas: estilo Buggy = los hijos del primer nodo que se ramifica (ensambles enteros)", () => {
  const rueda = N("rueda", false, N("llanta", true), N("rin", true), N("buje", true));
  const root = N("scene", false, N("vacio", false), N("raiz", false, N("chasis", true), rueda, N("asiento", true), N("volante", true)));
  check(names(findPieces(root)) === "chasis,rueda,asiento,volante", "piezas: " + names(findPieces(root)));
});

test("piezas: se bajan los envoltorios de un solo hijo", () => {
  const root = N("scene", false, N("w1", false, N("w2", false, N("a", true), N("b", true), N("c", true), N("d", true))));
  check(names(findPieces(root)) === "a,b,c,d", "piezas: " + names(findPieces(root)));
});

test("piezas: con pocas piezas se abre la mas grande (sin malla propia)", () => {
  const carro = N("carroceria", false, N("puerta", true), N("capo", true), N("techo", true));
  const root = N("scene", false, N("raiz", false, carro, N("rueda", true)));
  check(names(findPieces(root)) === "puerta,capo,techo,rueda", "piezas: " + names(findPieces(root)));
  const base = N("base", true, N("tapa", true));
  const root2 = N("scene", false, N("raiz", false, base, N("rueda", true)));
  check(names(findPieces(root2)) === "base,rueda", "con malla propia: " + names(findPieces(root2)));
});

test("piezas: un modelo de una sola malla es una sola pieza (no se desarma)", () => {
  check(names(findPieces(N("scene", false, N("escaneo", true)))) === "escaneo", "una pieza");
  check(findPieces(N("scene", false, N("vacio", false))).length === 0, "sin mallas: ninguna");
});

test("piezas: nombres legibles y automaticos descartados", () => {
  check(prettyName("Wheel_FL.001") === "Wheel FL", "Blender: " + prettyName("Wheel_FL.001"));
  check(prettyName("rueda-delantera") === "rueda delantera", "guiones");
  check(prettyName("") === null && prettyName(undefined) === null, "vacio");
  check(prettyName("Node_12") === null && prettyName("mesh.004") === null && prettyName("Object") === null, "automaticos");
});

test("piezas: punto de pantalla -> coordenadas del canvas (-1..1, y arriba)", () => {
  const r = { left: 100, top: 50, width: 400, height: 200 };
  const c = screenToNdc(r, 300, 150);
  near(c.x, 0, 1e-9, "centro x"); near(c.y, 0, 1e-9, "centro y");
  const tl = screenToNdc(r, 100, 50);
  near(tl.x, -1, 1e-9, "esquina x"); near(tl.y, 1, 1e-9, "esquina y (arriba = +1)");
  check(screenToNdc(r, 99, 150) === null, "fuera del canvas");
});

test("piezas: punto fuera del cuadro se lleva al borde con margen (la pieza no se sale)", () => {
  const r = { left: 0, top: 0, width: 200, height: 200 };
  const c = screenToNdcClamped(r, 500, -50, 0.1);
  near(c.x, 0.9, 1e-9, "x al borde derecho con margen"); near(c.y, 0.9, 1e-9, "y al borde de arriba con margen");
});

test("manifest: donde se busca y como agrupa piezas (con 'rest' y numeros invalidos)", () => {
  check(manifestPathFor("models/Buggy.glb") === "models/Buggy.json", "archivo suelto");
  check(manifestPathFor("models/bici/model.glb") === "models/bici/manifest.json", "carpeta");
  const sinManifest = groupPieces(3, null);
  check(sinManifest.length === 3 && sinManifest[2].members.join() === "2", "sin manifest: una pieza por pieza");
  const g = groupPieces(6, { pieces: [
    { label: "Chasis", parts: [1, 2] }, { label: "Rueda", parts: [3, 3, 99, "x"] }, { label: "Vacia", parts: [] },
  ] });
  check(g.map((x) => x.label || "-").join() === "Chasis,Rueda,-,-,-", "grupos + sueltas: " + g.map((x) => x.label).join());
  check(g[1].members.join() === "2", "repetidos e invalidos ignorados: " + g[1].members.join());
  const r = groupPieces(6, { pieces: [{ label: "Chasis", parts: [1] }, { label: "Rueda", parts: [2] }], rest: "Chasis" });
  check(r.length === 2 && r[0].members.join() === "0,2,3,4,5", "rest se lleva las no nombradas: " + r[0].members.join());
});

test("iman: encaja cerca de su lugar (relativo al tamano del cuadro), no lejos", () => {
  check(shouldSnap(PIECES.SNAP_FRAC * 560 - 1, 560), "justo adentro");
  check(!shouldSnap(PIECES.SNAP_FRAC * 560 + 1, 560), "justo afuera");
  check(shouldSnap(PIECES.SNAP_FRAC * 1120 - 1, 1120), "con el modelo agrandado el iman crece");
});

function pieceScene() {
  const s = makeScene();
  const model = { id: "m", type: "model", x: 600, y: 300, w: 560, h: 560, scale: 1, ry: 0 };
  s.items.push(model);
  const pieces = [{ home: [500, 300] }, { home: [700, 300] }].map((p) => ({ ...p, pos: [...p.home], placed: false }));
  const drags = new Map();
  Object.assign(s.adapter, {
    pieceAt(x, y) {
      const i = pieces.findIndex((p, k) => Math.hypot(x - p.pos[0], y - p.pos[1]) < 25 && ![...drags.values()].some((d) => d.i === k));
      return i >= 0 ? { item: model, part: i } : null;
    },
    beginPiece(item, i, hand, x, y) { drags.set(hand, { i, x0: x, y0: y, p0: [...pieces[i].pos] }); return true; },
    movePiece(item, hand, x, y) {
      const d = drags.get(hand);
      pieces[d.i].pos = [d.p0[0] + x - d.x0, d.p0[1] + y - d.y0];
    },
    endPiece(item, hand) {
      const d = drags.get(hand); drags.delete(hand);
      const p = pieces[d.i];
      const snapped = Math.hypot(p.pos[0] - p.home[0], p.pos[1] - p.home[1]) < 30;
      if (snapped) { p.pos = [...p.home]; p.placed = true; }
      return { snapped };
    },
  });
  return { ...s, model, pieces };
}

test("piezas (7C/7D): pinch sobre una pieza la arrastra sin mover el modelo; soltarla cerca encaja", () => {
  const s = pieceScene();
  const pipe = createInputPipeline(s.adapter);
  let t = 1000;
  const step = (m) => pipe.step({ detections: null, video: null, now: (t += 16), view: VIEW, extra: [m] });
  step(mouseState(500, 300, true, "start"));
  check(pipe.arbiter.mode() === "PIECE", "modo PIECE, es " + pipe.arbiter.mode());
  for (let i = 1; i <= 10; i++) step(mouseState(500 + i * 15, 300 - i * 10, true));
  step(mouseState(650, 200, false, "end"));
  near(s.pieces[0].pos[0], 650, 1e-9, "la pieza se movio con la mano (x)");
  check(!s.pieces[0].placed, "lejos de su lugar no encaja");
  check(s.model.x === 600 && s.count("grab:start") === 0, "el modelo no se movio");
  check(s.count("cursor:tap") === 0, "tomar una pieza no es tap");
  step(mouseState(650, 200, true, "start"));
  for (let i = 1; i <= 10; i++) step(mouseState(650 - i * 14, 200 + i * 9.5, true));
  step(mouseState(510, 295, false, "end"));
  check(s.pieces[0].placed, "soltada cerca: encaja");
  const drops = s.events.filter((e) => e.e === "piece:drop").map((e) => e.snapped);
  check(drops.join() === "false,true", "eventos piece:drop: " + drops.join());
});

test("piezas: dos manos toman dos piezas distintas; la misma pieza no se toma dos veces", () => {
  const s = pieceScene();
  const pipe = createInputPipeline(s.adapter);
  let t = 1000;
  const hand = (id, x, y, pinched, change = null) => ({ ...mouseState(x, y, pinched, change), id, source: "hand" });
  const step = (...hs) => pipe.step({ detections: null, video: null, now: (t += 16), view: VIEW, extra: hs });
  step(hand("a", 500, 300, true, "start"), hand("b", 700, 300, true, "start"));
  check(pipe.arbiter.roleOf("a") === "piece" && pipe.arbiter.roleOf("b") === "piece", "las dos manos con pieza");
  step(hand("a", 520, 300, false, "end"), hand("b", 700, 300, false, "end"));
  check(s.pieces[0].placed && s.pieces[0].pos[0] === 500, "soltada a 20 px de su lugar: encajo");
  step(hand("c", 510, 300, true, "start"));
  step(hand("c", 550, 300, true));
  check(s.pieces[0].pos[0] === 540, "otra mano retoma la pieza encajada y la mueve +40: " + s.pieces[0].pos[0]);
});

test("armado guiado: orden (manifest o por tamano), solo encaja la que toca, termina al final", () => {
  const lags = [0.3, 0, 0.5, 0.1];
  check(guideOrder(lags, true).join() === "0,1,2,3", "con manifest: su orden");
  check(guideOrder(lags, false).join() === "1,3,0,2", "sin manifest: de la mas grande a la mas chica");
  const g = createGuide([2, 0, 1]);
  check(guideCanSnap(null, 1), "sin armado guiado cualquiera encaja");
  check(guideExpected(g) === 2 && !guideCanSnap(g, 0) && guideCanSnap(g, 2), "toca la 2");
  check(!guideAdvance(g, 0) && guideExpected(g) === 2, "encajar otra no avanza");
  check(!guideAdvance(g, 2) && guideExpected(g) === 0, "avanza a la 0");
  guideAdvance(g, 0);
  check(guideAdvance(g, 1) && guideExpected(g) === -1, "la ultima termina el armado");
});

test("manifest del Buggy movido a Modelos old: 16 piezas con nombre y el resto al chasis", () => {
  const path = join(HERE, "..", "media", "models", "Modelos old", "Buggy.json");
  if (!existsSync(path)) return;
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const g = groupPieces(129, manifest);
  check(g.length === 16 && g.every((x) => x.label), "16 grupos con nombre, hubo " + g.length);
  check(g.reduce((n, x) => n + x.members.length, 0) === 129, "ninguna pieza se pierde ni se repite");
  check(g[0].label === "Chasis" && g[0].members.length > 50, "el chasis se lleva las piezas chicas");
  check(g.filter((x) => /^Rueda/.test(x.label)).length === 6, "6 ruedas");
});

console.log("gestos con modelo entrenado (Fase A):");

test("modelo: la palma quieta detiene el giro; si el modelo no la ve abierta, no", () => {
  const s = makeScene();
  play(loadRec("model_palm"), s);
  const stops = s.events.filter((e) => e.e === "palm:stop").map((e) => e.paused);
  check(stops.join() === "true", "un solo palm:stop (la 2a palma el modelo dice None): " + stops.join());
  check(s.count("cursor:pinch-start") === 0, "ningun pinch");
});

test("modelo + metros: perilla de 40 grados gira ~36; puno hacia la camara no es perilla", () => {
  const s = makeScene();
  play(loadRec("model_dial"), s);
  check(s.count("palm:dial-start") === 1, "una sola sesion de perilla, hubo " + s.count("palm:dial-start"));
  near(s.byId("holo").ry, 36 * DEG, 2 * DEG, "giro del modelo (rad)");
  check(s.count("cursor:pinch-start") === 0, "ningun pinch");
});

test("volante: la palma de alto inclinada 40 grados gira el modelo y no lo detiene", () => {
  setSetting("palmTurn", "volante");
  try {
    const s = makeScene();
    play(loadRec("model_volante"), s);
    check(s.count("palm:dial-start") === 1, "una sesion de giro, hubo " + s.count("palm:dial-start"));
    near(s.byId("holo").ry, 36 * DEG, 4 * DEG, "giro: 40 grados menos 4 de zona muerta, igual que la perilla");
    check(s.count("palm:stop") === 0, "inclinarla no detiene el giro");
  } finally { setSetting("palmTurn", "perilla"); }
});

test("fuerza del pinch: 0 con la mano abierta, 1 en el corte, sube al juntar los dedos", () => {
  check(pinchStrength({ ratio: 0.9 }) === 0, "mano abierta: 0");
  check(pinchStrength({ ratio: PINCH.RATIO_ENTER }) === 1, "en el corte de entrada: 1");
  check(pinchStrength({ ratio: 0.5 }) < pinchStrength({ ratio: 0.45 }), "sube al acercar los dedos");
});

console.log("menu con la mano (docs/14, criterios de exito):");

const BENCH_TREMOR = 4;
const failSeeds = (r) => r.fails.map((f) => f.seed).join(",");

test("abrir el menu con el orbe: al menos 9 de 10 (50 intentos con temblor y salto del pinch)", () => {
  const r = rate(50, (s) => trialOpenMenu(s, BENCH_TREMOR));
  check(r.rate >= 0.9, r.ok + "/50, fallan semillas " + failSeeds(r));
});

test("pulsar la fila correcta: al menos 9 de 10", () => {
  const r = rate(50, (s) => trialPickRow(s, BENCH_TREMOR));
  check(r.rate >= 0.9, r.ok + "/50, fallan semillas " + failSeeds(r));
});

test("la ventana de intencion es la que sostiene la fila correcta", () => {
  const keep = { ms: UI_TARGET.INTENT_MS, skip: UI_TARGET.INTENT_SKIP_MS };
  UI_TARGET.INTENT_MS = 0;
  UI_TARGET.INTENT_SKIP_MS = 0;
  try {
    const r = rate(50, (s) => trialPickRow(s, BENCH_TREMOR));
    check(r.rate < 0.95, "sin intencion deberia fallar mas: " + r.ok + "/50");
  } finally {
    UI_TARGET.INTENT_MS = keep.ms;
    UI_TARGET.INTENT_SKIP_MS = keep.skip;
  }
});

test("2 minutos pasando la mano por el menu sin pinch: 0 activaciones", () => {
  const fired = sweepMenu(7, BENCH_TREMOR, 120000);
  check(fired.length === 0, "se activo: " + fired.map((f) => f.e + ":" + f.id).join(","));
});

test("orbe: 0 confusiones entre clic y arrastre", () => {
  const clicks = rate(25, (s) => trialClickOrDrag(s, BENCH_TREMOR, false));
  const drags = rate(25, (s) => trialClickOrDrag(s, BENCH_TREMOR, true));
  check(clicks.ok === 25, "clics tomados como otra cosa: semillas " + failSeeds(clicks));
  check(drags.ok === 25, "arrastres tomados como otra cosa: semillas " + failSeeds(drags));
});

console.log("permanencia en el menu:");

const DWELL_TREMOR = 8;

test("permanencia: selecciona la fila apuntada con la mano lejos, normal y cerca", () => {
  for (const span of [60, 110, 200, 260]) {
    const r = rate(20, (s) => trialDwell(s, DWELL_TREMOR * span / 110, { span }));
    check(r.rate >= 0.9, "mano de " + span + " px: " + r.ok + "/20, fallan semillas " + failSeeds(r));
  }
});

test("permanencia: pasar la mano 2 min sin detenerse no activa nada, con cada tiempo de Ajustes", () => {
  try {
    for (const time of ["800", "1000", "1200"]) {
      setSetting("dwellTime", time);
      const fired = sweepMenu(11, DWELL_TREMOR, 120000, { dwell: true });
      check(fired.length === 0, time + " ms: se activo " + fired.map((f) => f.id).join(","));
    }
  } finally {
    setSetting("dwellTime", "800");
  }
});

test("permanencia: por debajo de 0,7 s una mano que pasa ya activa opciones", () => {
  const keep = UI_TARGET.DWELL_MS;
  UI_TARGET.DWELL_MS = 600;
  try {
    check(sweepMenu(11, DWELL_TREMOR, 120000, { dwell: true }).length > 0, "con 0,6 s deberia activarse al pasar");
  } finally {
    UI_TARGET.DWELL_MS = keep;
  }
});

test("permanencia: el tiempo elegido en Ajustes se aplica y un valor raro vuelve a 0,8 s", () => {
  try {
    setSetting("dwellTime", "1200");
    check(UI_TARGET.DWELL_MS === 1200, "1,2 s aplicado: " + UI_TARGET.DWELL_MS);
    setSetting("dwellTime", "300");
    check(UI_TARGET.DWELL_MS === 800, "valor no permitido: " + UI_TARGET.DWELL_MS);
  } finally {
    setSetting("dwellTime", "800");
  }
});

console.log("mantener para confirmar (Salir, Reiniciar):");

test("mantener: Salir se activa una sola vez al mantener 1,8 s, con la mano lejos, normal y cerca", () => {
  for (const span of [60, 110, 200, 260]) {
    let ok = 0;
    for (let s = 1; s <= 20; s++) {
      const r = trialHold(s, DWELL_TREMOR * span / 110, { span });
      if (r.fires.length === 1 && r.exitFired) ok++;
    }
    check(ok === 20, "mano de " + span + " px: " + ok + "/20");
  }
});

test("mantener: un clic normal, soltar antes, apuntar a la fila vecina o arrepentirse no activan Salir", () => {
  const cases = [
    ["clic normal", (s) => ({ pinchMs: 60 + (s * 13) % 640 })],
    ["soltar a los 1,2 s", () => ({ pinchMs: 1200 })],
    ["mantener sobre Ajustes", () => ({ aim: "settings" })],
    ["alejarse antes de terminar", (s) => ({ leaveAfter: 300 + (s * 37) % 900 })],
  ];
  for (const [name, opts] of cases) {
    for (let s = 1; s <= 15; s++) {
      check(!trialHold(s, DWELL_TREMOR, opts(s)).exitFired, name + ": se activo Salir (semilla " + s + ")");
    }
  }
});

test("mantener: aguanta una deriva lenta de la mano de 40 px/s y cancela una de 80 px/s", () => {
  for (let s = 1; s <= 15; s++) {
    check(trialHold(s, DWELL_TREMOR, { drift: 40 }).exitFired, "40 px/s deberia confirmarse (semilla " + s + ")");
    check(!trialHold(s, DWELL_TREMOR, { drift: 80 }).exitFired, "80 px/s deberia cancelarse (semilla " + s + ")");
  }
});

console.log("dos manos (escalar y girar):");

test("dos manos: al pinchar salta el cursor, pero no el nudillo que sostiene la barra", () => {
  const tracker = createHandTracker(), engine = createGestureEngine();
  const video = { videoWidth: 1280, videoHeight: 720 }, view = { w: 1280, h: 720 };
  const step = (pose, t) => engine.update(tracker.update(frameToDetections({ hands: [hand(pose, 600, 300)] }), t), video, t, view)[0];
  let t = 0, open, closed;
  for (let i = 0; i < 20; i++, t += 33) open = step("open", t);
  for (let i = 0; i < 20; i++, t += 33) closed = step("pinch", t);
  check(Math.hypot(closed.ax - open.ax, closed.ay - open.ay) > 20, "el cursor deberia saltar al pinchar");
  check(Math.hypot(closed.kx - open.kx, closed.ky - open.ky) < 2, "el nudillo se movio " + Math.hypot(closed.kx - open.kx, closed.ky - open.ky).toFixed(1) + " px");
});

test("dos manos: la segunda mano se une igual con el objeto chico, normal o grande", () => {
  for (const scale of [0.3, 1, 2]) {
    for (let s = 1; s <= 15; s++) {
      check(trialJoin(s, { scale, outside: 40 }).ok, "escala " + scale + ", 40 px fuera del borde: no se unio (semilla " + s + ")");
      check(!trialJoin(s, { scale, outside: 160 }).ok, "escala " + scale + ", 160 px fuera del borde: se unio (semilla " + s + ")");
    }
  }
});

test("dos manos: al unirse, el modelo casi no cambia de tamano ni de giro", () => {
  const sc = summary(20, (s) => trialHoldStill(s, { tremor: 4 }), "scaleErr");
  const rot = summary(20, (s) => trialHoldStill(s, { tremor: 4 }), "rotDeg");
  check(sc.p90 <= 0.02, "escala p90 " + (sc.p90 * 100).toFixed(1) + " %");
  check(rot.p90 <= 1, "giro p90 " + rot.p90.toFixed(1) + " grados");
});

test("dos manos: quietas despues de escalar y girar, el modelo no oscila", () => {
  const sc = summary(20, (s) => trialHoldAfterMove(s, { tremor: 4 }), "scaleErr");
  check(sc.p90 <= 0.015, "escala p90 " + (sc.p90 * 100).toFixed(1) + " %");
});

console.log("desarmar con pinch en vacio:");

test("desarmar: un tap en vacio nunca desarma, con la mano lejos o muy cerca y temblor fuerte", () => {
  for (const span of [60, 110, 200, 260]) {
    for (let s = 1; s <= 15; s++) {
      const r = trialEmptyTap(s, { span, tremor: 8 * span / 110 });
      check(r.ok, "mano de " + span + " px: " + (r.exploded ? "desarmo" : "no fue tap") + " (semilla " + s + ")");
    }
  }
});

test("desarmar: el mismo movimiento del brazo desarma lo mismo con la mano lejos, normal o cerca", () => {
  const reach = [60, 110, 200].map((span) => {
    let sum = 0;
    for (let s = 1; s <= 8; s++) sum += trialExplodeDrag(s, { span, tremor: 4 * span / 110 }).reached;
    return sum / 8;
  });
  check(Math.max(...reach) - Math.min(...reach) < 0.05, "desarmado: " + reach.map((r) => (r * 100).toFixed(0) + " %").join(" / "));
});

test("desarmar: arrastrar en vertical no desarma", () => {
  for (const span of [60, 110, 200]) {
    for (let s = 1; s <= 10; s++) {
      check(trialVerticalDrag(s, { span, tremor: 4 * span / 110 }).ok, "mano de " + span + " px desarmo (semilla " + s + ")");
    }
  }
});

console.log("palma de alto (detener / reanudar el giro):");

test("palma: detiene el giro con y sin modelo, mano lejos, normal o cerca, inclinada hasta 30 grados", () => {
  for (const model of [true, false]) {
    for (const span of [60, 110, 200]) {
      for (let s = 1; s <= 6; s++) {
        check(trialStop(s, { span, tremor: 8 * span / 110, model, roll: (s % 3) * 15 }).ok,
          (model ? "con" : "sin") + " modelo, mano de " + span + " px (semilla " + s + ")");
      }
    }
  }
});

test("palma: quieta sobre el menu abierto no detiene el modelo", () => {
  for (const model of [true, false]) {
    for (let s = 1; s <= 15; s++) {
      check(trialPalmOverMenu(s, { model }).stops === 0, (model ? "con" : "sin") + " modelo se detuvo (semilla " + s + ")");
    }
  }
});

test("palma: pasar la palma abierta 2 min sin detenerse no activa nada", () => {
  for (const span of [110, 200]) {
    const n = sweepPalm(12, 120000, { span, tremor: 4 * span / 110 });
    check(n === 0, "mano de " + span + " px: " + n + " activaciones");
  }
});

test("palma: con 0,6 s una palma que pasa ya se activa (por eso 0,8 s)", () => {
  const keep = PALM.STOP_MS;
  PALM.STOP_MS = 600;
  try {
    let n = 0;
    for (let k = 0; k < 3; k++) n += sweepPalm(10 + k, 120000, { span: 200, tremor: 4 * 200 / 110 });
    check(n > 0, "con 0,6 s deberia activarse al pasar");
  } finally {
    PALM.STOP_MS = keep;
  }
});

console.log("palma perilla (girar la muneca):");

const dialJitter = (noise) => {
  const xs = [];
  for (let s = 1; s <= 15; s++) xs.push(trialDial(s, { noise }).jitter);
  return xs.sort((a, b) => a - b)[Math.floor(0.9 * xs.length)];
};

test("perilla: con ruido en cada punto (3 px), el modelo no tiembla al sostener la mano quieta", () => {
  const j = dialJitter(3);
  check(j <= 1.5, "temblor p90 " + j.toFixed(1) + " grados");
});

test("perilla: sin el filtro del angulo ni la holgura, ese mismo ruido si hace temblar el modelo", () => {
  const keep = { filter: PALM.ANGLE_FILTER, dz: PALM.DIAL_DEADZONE };
  PALM.ANGLE_FILTER = { minCutoff: 1e6, beta: 0, dCutoff: 1 };
  PALM.DIAL_DEADZONE = 0;
  try {
    const j = dialJitter(3);
    check(j > 5, "sin proteccion deberia temblar: p90 " + j.toFixed(1) + " grados");
  } finally {
    PALM.ANGLE_FILTER = keep.filter;
    PALM.DIAL_DEADZONE = keep.dz;
  }
});

test("perilla: con ruido en cada punto la sesion no se corta y gira lo pedido", () => {
  for (let s = 1; s <= 15; s++) {
    const r = trialDial(s, { noise: 3 });
    check(r.sessions === 1 && r.ends === 0, "sesion cortada (semilla " + s + ")");
    check(Math.abs(r.turned - 36) <= 4, "giro " + r.turned.toFixed(1) + " grados en vez de 36 (semilla " + s + ")");
  }
});

test("perilla: sobre el menu abierto no empieza a girar el modelo", () => {
  for (let s = 1; s <= 10; s++) {
    check(trialPalmOverMenu(s, { pose: "dial" }).dials === 0, "empezo la perilla sobre el menu (semilla " + s + ")");
  }
});

console.log("palma volante (inclinar la palma de alto):");

const withVolante = (fn) => {
  setSetting("palmTurn", "volante");
  try { fn(); } finally { setSetting("palmTurn", "perilla"); }
};

test("volante: una palma quieta no se inclina sola hasta el umbral de giro, ni con 6 px de ruido", () => {
  for (const model of [true, false]) {
    let worst = 0;
    for (let s = 1; s <= 15; s++) worst = Math.max(worst, trialStillDrift(s, { noise: 6, model }).driftDeg);
    check(worst < PALM.VOLANTE_START * 180 / Math.PI, (model ? "con" : "sin") + " modelo se inclino " + worst.toFixed(1) + " grados");
  }
});

test("volante: la palma quieta sigue deteniendo el giro y no gira el modelo", () => {
  withVolante(() => {
    for (let s = 1; s <= 10; s++) {
      check(trialStop(s, { noise: 3, holdMs: 1500 }).ok, "no detuvo (semilla " + s + ")");
      check(trialStillDrift(s, { noise: 3 }).driftDeg < 10, "se inclino sola (semilla " + s + ")");
    }
  });
});

test("volante: inclinar 40 grados gira 36, igual que la perilla, sin detener el giro", () => {
  withVolante(() => {
    for (let s = 1; s <= 10; s++) {
      const r = trialVolante(s, { noise: 3 });
      check(r.sessions === 1 && r.stops === 0, "sesiones " + r.sessions + ", detenciones " + r.stops + " (semilla " + s + ")");
      check(Math.abs(r.turned - 36) <= 4, "giro " + r.turned.toFixed(1) + " grados (semilla " + s + ")");
    }
  });
});

console.log("tomar una pieza (modelo desarmado):");

const pieceRate = (opts, n = 20) => {
  let ok = 0;
  for (let s = 1; s <= n; s++) if (trialPiece(s, opts).ok) ok++;
  return ok / n;
};

test("piezas: el salto del pinch no hace perder la pieza apuntada, chica o grande, con la mano lejos o cerca", () => {
  for (const span of [60, 110, 200]) {
    for (const radius of [8, 12, 20]) {
      const r = pieceRate({ radius, span, tremor: 4 * span / 110 });
      check(r >= 0.95, "mano " + span + " px, pieza de radio " + radius + ": " + Math.round(r * 100) + " %");
    }
  }
});

test("piezas: sin el punto de intencion, el salto si hace perder las piezas chicas", () => {
  const keep = { ms: UI_TARGET.INTENT_MS, skip: UI_TARGET.INTENT_SKIP_MS };
  UI_TARGET.INTENT_MS = 0;
  UI_TARGET.INTENT_SKIP_MS = 0;
  try {
    const r = pieceRate({ radius: 12 });
    check(r < 0.5, "sin intencion deberia fallar: " + Math.round(r * 100) + " %");
  } finally {
    UI_TARGET.INTENT_MS = keep.ms;
    UI_TARGET.INTENT_SKIP_MS = keep.skip;
  }
});

test("piezas: apuntando un poco fuera del borde, igual se toma la pieza mas cercana", () => {
  for (const radius of [8, 12, 20]) {
    const r = pieceRate({ radius, aim: 1.3 });
    check(r >= 0.95, "pieza de radio " + radius + ": " + Math.round(r * 100) + " %");
  }
});

test("piezas: sin la seleccion por proximidad, apuntar fuera del borde falla mucho mas", () => {
  const keep = PIECES.NEAR_SPAN;
  PIECES.NEAR_SPAN = 0;
  try {
    const r = pieceRate({ radius: 12, aim: 1.3 });
    check(r < 0.8, "sin proximidad deberia fallar mas: " + Math.round(r * 100) + " %");
  } finally {
    PIECES.NEAR_SPAN = keep;
  }
});

console.log("\n" + passed + " ok, " + failed + " fallas");
process.exit(failed ? 1 : 0);
