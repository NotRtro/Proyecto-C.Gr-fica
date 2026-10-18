// Tracker: camara (o grabacion) + gestos + escena + interfaz. Es la pagina
// "real" que usa el operador (sin ?role=render).
//
// Teclas: M menu, Esc cerrar menu, R recargar, C cambiar camara, H overlay de
// debug, G grabar/detener (al detener se descarga un .json para tests/recordings/).
// ?replay=<nombre> reproduce tests/recordings/<nombre>.json en lugar de la camara;
// con &step=1 lo hace cuadro a cuadro con el tiempo de la grabacion (pruebas).
// ?calibrar=1 abre directamente el asistente "Calibrar mis manos".
import { Q } from "../core/env.js";
import { store } from "../core/store.js";
import { on } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { PUSH_HZ } from "../core/config.js";
import { getItemType, removeItem } from "../items/registry.js";
import { openCamera, cycleCamera, videoEl } from "../input/camera.js";
import { currentView } from "../input/coords.js";
import { detectionsFromMediaPipe } from "../input/hands.js";
import { createMouseInput } from "../input/mouse.js";
import { createRecorder, createReplaySource, loadRecording, downloadJson } from "../input/recorder.js";
import { renderCursors, pulseCursor } from "../ui/cursors.js";
import { mountMenu, toggleMenu, closeMenu, resetMenuLayout } from "../ui/menu.js";
import "../ui/pages.js";
import { updatePointer, holdProgressOf, cursorDisplayPoint } from "../ui/pointer.js";
import { startTutorial, updateTutorial } from "../ui/tutorial.js";
import { updateCalibration, startCalibration } from "../ui/calibration.js";
import { toast, showEndScreen, playClick } from "../ui/feedback.js";
import { pushState, flushState, loadConfig } from "../net/sync.js";
import { applyCmds } from "../commands.js";
import { spawnStage, resetAll } from "./scene.js";
import { refreshCatalog } from "../net/catalog.js";
import { input, hoverKindAt } from "./interaction.js";

const MEDIAPIPE_VERSION = "0.10.14";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";


const REPLAY = Q.get("replay");
const recorder = createRecorder();
const mouse = createMouseInput({ onWheel: (x, y, dy, shift) => input.arbiter.wheel(x, y, dy, shift) });

let replay = null;
let running = true;
let lastVideoTime = -1;
let lastVideo = null;
let lastFrameT = performance.now();
let lastPushT = 0;
let fps = 0;

function setBadge(text) {
  const b = document.getElementById("badge");
  b.textContent = text || "";
  b.classList.toggle("visible", !!text);
}

function toggleHud() {
  store.showHud = !store.showHud;
  document.getElementById("hud").classList.toggle("visible", store.showHud);
}

function updateHud() {
  const f2 = (v) => (v ?? 0).toFixed(2);
  const lines = ["fps " + fps.toFixed(1) + "   modo " + input.arbiter.mode()];
  for (const h of store.hands) {
    const role = input.arbiter.roleOf(h.id);
    if (h.source === "mouse") { lines.push("mouse: pinch=" + h.pinched + " rol=" + role); continue; }
    const m = h.metrics || {};
    lines.push(h.id + " " + h.handedness + (h.present ? "" : " (perdida)")
      + ": pinch=" + h.pinched + " rol=" + role
      + " ratio=" + f2(m.ratio) + " arch=" + f2(m.arch) + " back=" + f2(m.backMean)
      + " indice=" + f2(m.f8) + " forma=" + (m.kind || "-"));
  }
  lines.push("", "M menu  H debug  C camara  G grabar  R recargar",
    "mouse: arrastrar, rueda=escala, Shift+rueda=rotar");
  document.getElementById("hud").textContent = lines.join("\n");
}

function toggleRecording() {
  if (recorder.active()) {
    const rec = recorder.stop();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadJson(rec, "grabacion-" + stamp + ".json");
    setBadge(REPLAY ? "REPLAY " + REPLAY : "");
    toast("Grabación descargada (" + rec.frames.length + " frames)");
  } else {
    const src = replay ? replay.video : videoEl();
    if (!src.videoWidth) { toast("Sin cámara: no hay nada que grabar", { kind: "error" }); return; }
    recorder.start(src);
  }
}

function onKeyDown(e) {
  if (!running) return;
  const k = e.key.toLowerCase();
  if (k === "m") toggleMenu();
  else if (k === "escape") closeMenu();
  else if (k === "r") location.reload();
  else if (k === "c") cycleCamera();
  else if (k === "g") toggleRecording();
  else if (k === "h") toggleHud();
}

// Devuelve detecciones solo si hay un frame NUEVO (la camara va a ~30 fps y la
// pantalla a ~60: repetir la deteccion sobre el mismo frame gasta CPU y ademas
// contaria doble los frames de confirmacion del pinch).
function readDetections(now) {
  if (replay) {
    const d = replay.next(now);
    if (d) lastVideo = replay.video;
    return d;
  }
  const video = videoEl();
  if (!store.landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return null;
  lastVideoTime = video.currentTime;
  lastVideo = video;
  return detectionsFromMediaPipe(store.landmarker.detectForVideo(video, now));
}

// Progreso que muestra el anillo de cada cursor: boton "mantener" o levantar el orbe.
function cursorProgress(h) {
  return holdProgressOf(h.id);
}

function frame(now) {
  if (!running) return;
  const dt = (now - lastFrameT) / 1000;
  lastFrameT = now;
  fps = fps * 0.9 + (dt > 0 ? 0.1 / dt : 0);

  const detections = readDetections(now);
  // Tiempo de gestos e interfaz: el real, o el de la grabacion en replay cuadro a cuadro.
  const tIn = replay ? replay.clock(now) : now;
  if (detections && recorder.active()) {
    recorder.push(detections, now);
    setBadge("● REC " + recorder.frames());
  }
  // store.hands = manos de la camara + el mouse (si se uso). La interfaz y el
  // tutorial tratan a ambos igual; sync.js y los cursores ignoran el mouse.
  const mouseStates = mouse.used() ? [mouse.state()] : [];
  store.hands = input.step({
    detections, video: lastVideo, now: tIn, view: currentView(), extra: mouseStates,
  }).concat(mouseStates);
  updatePointer(store.hands, tIn);
  renderCursors(store.hands, { kindAt: hoverKindAt, progressOf: cursorProgress, displayOf: cursorDisplayPoint });
  updateTutorial();
  updateCalibration(store.hands, tIn);

  for (const it of store.items) {
    const T = getItemType(it.type);
    if (T && T.update) T.update(it, dt, now);
  }
  if (store.showHud) updateHud();
  if (now - lastPushT >= 1000 / PUSH_HZ) { lastPushT = now; pushState(); }
  requestAnimationFrame(frame);
}

// "Salir": apaga la camara y el detector, libera la escena (WebGL incluido) y
// publica una escena vacia para que OBS no se quede con la ultima imagen.
async function shutdown() {
  if (!running) return;
  running = false;
  if (recorder.active()) recorder.stop();
  const video = videoEl();
  if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
  if (store.landmarker && store.landmarker.close) {
    try { store.landmarker.close(); } catch (e) { /* ya estaba cerrado */ }
  }
  store.landmarker = null;
  input.reset();
  for (const it of [...store.items]) removeItem(it);
  store.hands = [];
  renderCursors([], { kindAt: () => null, progressOf: () => 0 });
  await flushState();
  document.getElementById("ui").replaceChildren();
  document.getElementById("hud").classList.remove("visible");
  setBadge("");
  showEndScreen();
}

async function loadHandLandmarker() {
  const base = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MEDIAPIPE_VERSION;
  const { FilesetResolver, HandLandmarker } = await import(base + "/vision_bundle.mjs");
  const vision = await FilesetResolver.forVisionTasks(base + "/wasm");
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

// Los errores se muestran como avisos fijos que NO tapan la pantalla: el mouse y
// el menu siguen funcionando sin camara.
async function startCamera() {
  const loading = toast("Cargando detector de manos…", { ms: 0 });
  try {
    store.landmarker = await loadHandLandmarker();
  } catch (e) {
    toast("No se pudo cargar MediaPipe (revisa tu conexión a internet). Puedes usar el mouse.",
      { ms: 0, kind: "error" });
  }
  loading.remove();
  try {
    await openCamera();
  } catch (e) {
    toast("No se pudo abrir la cámara (" + (e && e.message ? e.message : e) + "). " +
      "Revisa los permisos o que otra app no la esté usando. Puedes usar el mouse.",
      { ms: 0, kind: "error" });
  }
}

async function startReplay() {
  try {
    const rec = await loadRecording(REPLAY);
    replay = createReplaySource(rec, {
      step: Q.get("step") === "1",
      onLoop() { input.reset(); resetAll(); resetMenuLayout(); applyCmds(rec.setup || []); },
    });
    setBadge("REPLAY " + REPLAY);
  } catch (e) {
    toast("No se pudo cargar la grabación: " + e.message, { ms: 0, kind: "error" });
  }
}

export async function bootTracker() {
  // Escena, interfaz y loop arrancan YA: mientras MediaPipe carga (unos segundos)
  // o si la camara falla, el mouse y el menu funcionan igual.
  spawnStage();
  mountMenu();
  on("hud:toggle", toggleHud);
  on("app:exit", shutdown);
  // Confirmacion de cada pulsacion de la interfaz: pulso del cursor y click sonoro.
  on("ui:click", ({ hand }) => {
    pulseCursor(hand);
    if (settings.clickSound) playClick();
  });
  window.addEventListener("keydown", onKeyDown);
  requestAnimationFrame(frame);

  await loadConfig();
  refreshCatalog(); // nombres del catalogo 3D disponibles desde el inicio
  const calibrateNow = Q.get("calibrar") === "1";
  if (calibrateNow) startCalibration();
  if (REPLAY) await startReplay();
  else {
    if (!settings.tutorialDone && !calibrateNow) startTutorial();
    await startCamera();
  }
}
