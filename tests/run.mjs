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
import { createPointFilter } from "../js/input/filters.js";
import { CURSOR_FILTER, PINCH, UI_TARGET, UI_PRESS } from "../js/core/config.js";
import { createPress, stepPress, endPress, clickTravel } from "../js/ui/press.js";
import { stickyTarget, nearestIn, pickIntent, magnetPoint, createDwell, stepDwell } from "../js/ui/targeting.js";
import { analyzeHand } from "../js/input/calibration.js";
import { setSetting } from "../js/core/settings.js";
import { samplesFromRecording } from "./calibrate.mjs";
import { explodePlan, partFactor } from "../js/three/explodePlan.js";

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

test("palm: la mano abierta y quieta no dispara nada (ni pinch ni tap)", () => {
  const s = makeScene();
  play(loadRec("palm"), s);
  check(s.events.length === 0, "no deberia haber eventos, hubo: " + s.events.map((e) => e.e).join(","));
});

// ---- mouse (sin grabacion) --------------------------------------------------

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

test("interfaz encima: un pinch sobre el menu no agarra ni explota lo de atras", () => {
  const s = makeScene();
  // Simula un panel de menu que tapa la franja x >= 600 (encima de parte del reactor).
  s.adapter.isUiAt = (x) => x >= 600;
  const pipe = createInputPipeline(s.adapter);
  let t = 1000;
  const step = (m) => pipe.step({ detections: null, video: null, now: (t += 16), view: VIEW, extra: [m] });
  step(mouseState(700, 300, true, "start")); // sobre el reactor, pero la UI esta encima
  for (let i = 1; i <= 10; i++) step(mouseState(700 + i * 30, 300, true));
  step(mouseState(1000, 300, false, "end"));
  near(s.byId("holo").x, 640, 0.001, "el reactor no se movio");
  check(s.byId("holo").explodeTarget === 0, "tampoco se exploto");
  const end = s.events.find((e) => e.e === "cursor:pinch-end");
  check(end && end.x === 1000 && end.y === 300, "pinch-end trae la posicion (para los botones)");
});

// ---- interfaz: click vs arrastre (js/ui/press.js) y filtro del cursor ------

console.log("interfaz (docs/14, paso A):");

// Ruido determinista (mismo resultado en cada corrida).
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Simula un grab de mano sobre la interfaz: temblor de +-jitter px alrededor de
// una trayectoria. path(t) -> {x, y} (t en ms). Devuelve eventos y resultado.
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
  const rand = rng(7);
  const f = createPointFilter(CURSOR_FILTER);
  let rawErr = 0, filtErr = 0, n = 0;
  for (let t = 0; t <= 2000; t += 33) {
    const raw = { x: 500 + (rand() * 2 - 1) * 8, y: 300 + (rand() * 2 - 1) * 8 };
    const q = f.filter(raw, t);
    if (t > 500) { rawErr += Math.hypot(raw.x - 500, raw.y - 300); filtErr += Math.hypot(q.x - 500, q.y - 300); n++; }
  }
  check(filtErr / n < 0.4 * (rawErr / n), "temblor filtrado " + (filtErr / n).toFixed(2) + " px vs crudo " + (rawErr / n).toFixed(2) + " px");
  // Movimiento rapido de 300 px en 200 ms: a los 150 ms de terminado debe estar a menos de 25 px.
  let q = null;
  for (let t = 2033; t <= 2400; t += 33) {
    const x = 500 + Math.min(1, (t - 2033) / 200) * 300;
    q = f.filter({ x, y: 300 }, t);
  }
  check(Math.abs(q.x - 800) < 25, "retraso tras moverse: " + Math.abs(q.x - 800).toFixed(1) + " px");
});

// ---- interfaz: a que fila apunta la mano (js/ui/targeting.js) ----------------

console.log("interfaz (docs/14, paso B):");

// Dos filas del menu como las del CSS: 56 px de alto y 6 px de separacion.
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
  // 600 ms apuntando al centro de A con temblor, luego ~130 ms cerrando los dedos
  // (el cursor baja 42 px hasta la fila B) y el pinch se confirma.
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

// ---- interfaz: seleccion por permanencia (dwell) -----------------------------

console.log("interfaz (docs/14, paso C):");

// Recorre una trayectoria de (key, x, y) cada 33 ms y cuenta disparos.
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
  // La clave es la accion: tras desplegar una carpeta, su fila es otro nodo pero
  // la misma accion; no debe volver a plegarse sola.
  const fires = simulateDwell(hold(90, "menu:folder|view", 8));
  check(fires.length === 1, "disparos: " + fires.length);
});

// ---- calibracion de la mano (js/input/calibration.js) -----------------------

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
  const rand = rng(21), A = 6; // temblor uniforme +-6 px => RMS = sqrt(2*36/3) = 4.9 px
  const samples = [];
  let t = 0;
  for (let i = 0; i < 60; i++, t += 33) samples.push({ t, x: 500 + (rand() * 2 - 1) * A, y: 300 + (rand() * 2 - 1) * A, ratio: 0.7, span: 110 });
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < 8; i++, t += 33) samples.push({ t, x: 525, y: 275, ratio: 0.07, span: 110 });
    for (let i = 0; i < 8; i++, t += 33) samples.push({ t, x: 500, y: 300, ratio: 0.7, span: 110 });
  }
  const r = analyzeHand(samples);
  check(r.ok, r.reason);
  // Se mide el segundo MAS quieto: da algo menos que el RMS de toda la serie.
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

test("calibracion guardada: se aplica sobre los umbrales y la sensibilidad es relativa", () => {
  setSetting("calibration", { ratioEnter: 0.3, ratioHold: 0.4, hysteresisPx: 14, travelMinPx: 40 });
  near(PINCH.RATIO_ENTER, 0.3, 1e-9, "pinch calibrado");
  check(UI_TARGET.HYSTERESIS_PX === 14 && UI_PRESS.TRAVEL_MIN === 40, "histeresis y recorrido calibrados");
  setSetting("pinchSensitivity", "high");
  near(PINCH.RATIO_ENTER, 0.37, 1e-9, "sensibilidad alta = calibrado + 0.07");
  setSetting("pinchSensitivity", "normal");
  setSetting("calibration", null);
  near(PINCH.RATIO_ENTER, 0.35, 1e-9, "de vuelta a fabrica");
  check(UI_TARGET.HYSTERESIS_PX === 10 && UI_PRESS.TRAVEL_MIN === 30, "de vuelta a fabrica");
});

// ---- catalogo 3D: plan de explode por piezas (js/three/explodePlan.js) -------

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

console.log("\n" + passed + " ok, " + failed + " fallas");
process.exit(failed ? 1 : 0);
