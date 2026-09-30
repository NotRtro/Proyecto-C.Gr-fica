// Tracker: camara (o grabacion) + gestos + escena. Es la pagina "real" que usa
// el operador (sin ?role=render).
//
// Teclas: R recargar, C cambiar camara, H overlay de debug, G grabar/detener
// (al detener se descarga un .json para tests/recordings/).
// ?replay=<nombre> reproduce tests/recordings/<nombre>.json en lugar de la camara.
import { Q } from "../core/env.js";
import { store } from "../core/store.js";
import { on } from "../core/bus.js";
import { RING_POLL_MS, PUSH_HZ } from "../core/config.js";
import { getItemType } from "../items/registry.js";
import { openCamera, cycleCamera, videoEl } from "../input/camera.js";
import { currentView } from "../input/coords.js";
import { detectionsFromMediaPipe } from "../input/hands.js";
import { createMouseInput } from "../input/mouse.js";
import { createRecorder, createReplaySource, loadRecording, downloadJson } from "../input/recorder.js";
import { renderCursors } from "../ui/cursors.js";
import { pushState, pollRing, loadConfig } from "../net/sync.js";
import { applyCmds } from "../commands.js";
import { spawnStage, resetAll } from "./scene.js";
import { input } from "./interaction.js";

const MEDIAPIPE_VERSION = "0.10.14";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const REPLAY = Q.get("replay");
const recorder = createRecorder();
const mouse = createMouseInput({ onWheel: (x, y, dy, shift) => input.arbiter.wheel(x, y, dy, shift) });

let replay = null;
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
      + " palma=" + f2(h.palmProgress));
  }
  lines.push("", "R recargar  C camara  H debug  G grabar", "mouse: arrastrar, rueda=escala, Shift+rueda=rotar");
  document.getElementById("hud").textContent = lines.join("\n");
}

function toggleRecording() {
  if (recorder.active()) {
    const rec = recorder.stop();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadJson(rec, "grabacion-" + stamp + ".json");
    setBadge(REPLAY ? "REPLAY " + REPLAY : "");
  } else {
    const src = replay ? replay.video : videoEl();
    if (!src.videoWidth) { setBadge("sin camara: no hay nada que grabar"); return; }
    recorder.start(src);
  }
}

function onKeyDown(e) {
  if (e.key === "r" || e.key === "R") location.reload();
  else if (e.key === "c" || e.key === "C") cycleCamera();
  else if (e.key === "g" || e.key === "G") toggleRecording();
  else if (e.key === "h" || e.key === "H") {
    store.showHud = !store.showHud;
    document.getElementById("hud").classList.toggle("visible", store.showHud);
  }
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

function frame(now) {
  const dt = (now - lastFrameT) / 1000;
  lastFrameT = now;
  fps = fps * 0.9 + (dt > 0 ? 0.1 / dt : 0);

  const detections = readDetections(now);
  if (detections && recorder.active()) {
    recorder.push(detections, now);
    setBadge("● REC " + recorder.frames());
  }
  store.hands = input.step({
    detections, video: lastVideo, now, view: currentView(),
    extra: mouse.used() ? [mouse.state()] : [],
  });
  renderCursors(store.hands);

  for (const it of store.items) {
    const T = getItemType(it.type);
    if (T && T.update) T.update(it, dt, now);
  }
  if (store.showHud) updateHud();
  if (now - lastPushT >= 1000 / PUSH_HZ) { lastPushT = now; pushState(); }
  requestAnimationFrame(frame);
}

function showBootError(message) {
  const div = document.createElement("div");
  div.id = "guard";
  div.textContent = message;
  document.body.appendChild(div);
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

async function startCamera() {
  try {
    store.landmarker = await loadHandLandmarker();
  } catch (e) {
    showBootError("No se pudo cargar MediaPipe (revisa tu conexion a internet). " + e);
  }
  try {
    await openCamera();
  } catch (e) {
    showBootError(
      "No se pudo abrir la camara: " + (e && e.message ? e.message : e) + "\n" +
      "Revisa permisos del navegador, que ninguna otra app la este usando, " +
      "o proba otra camara con ?cam=<nombre>. El mouse sigue funcionando.");
  }
}

async function startReplay() {
  try {
    const rec = await loadRecording(REPLAY);
    replay = createReplaySource(rec, {
      onLoop() { input.reset(); resetAll(); applyCmds(rec.setup || []); },
    });
    setBadge("REPLAY " + REPLAY);
  } catch (e) {
    showBootError("No se pudo cargar la grabacion: " + e.message);
  }
}

export async function bootTracker() {
  // La escena aparece antes que la camara: si el permiso falla, igual se ve.
  spawnStage();
  on("gesture:palm", (p) => console.debug("[barehands] palma abierta sostenida", p));
  await loadConfig();
  if (REPLAY) await startReplay();
  else await startCamera();
  window.addEventListener("keydown", onKeyDown);
  setInterval(pollRing, RING_POLL_MS);
  requestAnimationFrame(frame);
}
