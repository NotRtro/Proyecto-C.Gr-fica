// Tracker: camara + MediaPipe + gestos + escena. Es la pagina "real" que usa el
// operador (sin ?role=render).
import { store } from "../core/store.js";
import { RING_POLL_MS } from "../core/config.js";
import { getItemType } from "../items/registry.js";
import { openCamera, cycleCamera, videoEl } from "../input/camera.js";
import { updateCursorsFromHandResults } from "../input/cursors.js";
import { pushState, pollRing, loadConfig } from "../net/sync.js";
import { spawnStage } from "./scene.js";

const MEDIAPIPE_VERSION = "0.10.14";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let lastFrameT = performance.now();
let fps = 0;

function updateHud() {
  const lines = ["fps " + fps.toFixed(1)];
  for (const [label, c] of Object.entries(store.cursors)) {
    const m = c.metrics || {};
    lines.push(label + ": pinch=" + c.pinched
      + " ratio=" + (m.ratio ?? 0).toFixed(2)
      + " arch=" + (m.arch ?? 0).toFixed(2)
      + " back=" + (m.backMean ?? 0).toFixed(2));
  }
  document.getElementById("hud").textContent = lines.join("\n");
}

function onKeyDown(e) {
  if (e.key === "r" || e.key === "R") location.reload();
  else if (e.key === "c" || e.key === "C") cycleCamera();
  else if (e.key === "h" || e.key === "H") {
    store.showHud = !store.showHud;
    document.getElementById("hud").classList.toggle("visible", store.showHud);
  }
}

function frame(now) {
  const dt = (now - lastFrameT) / 1000;
  lastFrameT = now;
  fps = fps * 0.9 + (dt > 0 ? 0.1 / dt : 0);

  const video = videoEl();
  if (store.landmarker && video.readyState >= 2) {
    const res = store.landmarker.detectForVideo(video, now);
    updateCursorsFromHandResults(res, video, now);
  }
  for (const it of store.items) {
    const T = getItemType(it.type);
    if (T && T.update) T.update(it, dt, now);
  }
  if (store.showHud) updateHud();
  pushState();
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

export async function bootTracker() {
  // La escena aparece antes que la camara: si el permiso falla, igual se ve.
  spawnStage();
  try {
    store.landmarker = await loadHandLandmarker();
  } catch (e) {
    showBootError("No se pudo cargar MediaPipe (revisa tu conexion a internet). " + e);
  }
  await loadConfig();
  try {
    await openCamera();
  } catch (e) {
    showBootError(
      "No se pudo abrir la camara: " + (e && e.message ? e.message : e) + "\n" +
      "Revisa permisos del navegador, que ninguna otra app la este usando, " +
      "o proba otra camara con ?cam=<nombre>.");
  }
  window.addEventListener("keydown", onKeyDown);
  setInterval(pollRing, RING_POLL_MS);
  requestAnimationFrame(frame);
}
