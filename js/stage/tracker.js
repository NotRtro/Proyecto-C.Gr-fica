import { Q } from "../core/env.js";
import { store } from "../core/store.js";
import { on } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { PUSH_HZ, PALM, HANDS } from "../core/config.js";
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
import { updatePartHover } from "../ui/partHover.js";
import "../ui/guide.js";

const MEDIAPIPE_VERSION = "0.10.14";
const GESTURE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
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
    const pm = m.palm || {};
    const w = pm.world;
    lines.push("    palma=" + ((h.palm && h.palm.pose) || "-") + " fuerza=" + f2(h.pinchStrength)
      + " incl=" + Math.round((pm.tilt || 0) * 57.3) + "°"
      + (h.palm ? " ang=" + Math.round(h.palm.angle * 57.3) + "°" : "")
      + (m.model ? " modelo=" + m.model.name + " " + f2(m.model.score) : " modelo=-")
      + (w ? " rectos=" + f2(w.straight) + " haciaCam=" + f2(w.axis) : " dedos2D=" + f2(pm.ext2) + " prof=" + f2(pm.depth)));
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
  const res = store.landmarker.recognizeForVideo
    ? store.landmarker.recognizeForVideo(video, now)
    : store.landmarker.detectForVideo(video, now);
  return detectionsFromMediaPipe(res);
}

function cursorProgress(h) {
  const palm = h.palm && h.palm.pose === "stop" && h.palm.progress > PALM.SHOW_FROM ? h.palm.progress : 0;
  return Math.max(holdProgressOf(h.id), palm);
}

function frame(now) {
  if (!running) return;
  const dt = (now - lastFrameT) / 1000;
  lastFrameT = now;
  fps = fps * 0.9 + (dt > 0 ? 0.1 / dt : 0);

  const detections = readDetections(now);
  const tIn = replay ? replay.clock(now) : now;
  if (detections && recorder.active()) {
    recorder.push(detections, now);
    setBadge("● REC " + recorder.frames());
  }
  const mouseStates = mouse.used() ? [mouse.state()] : [];
  store.hands = input.step({
    detections, video: lastVideo, now: tIn, view: currentView(), extra: mouseStates,
  }).concat(mouseStates);
  updatePointer(store.hands, tIn);
  updatePartHover(store.hands, { locked: input.arbiter.isLocked(), now: tIn });
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

async function shutdown() {
  if (!running) return;
  running = false;
  if (recorder.active()) recorder.stop();
  const video = videoEl();
  if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
  if (store.landmarker && store.landmarker.close) {
    try { store.landmarker.close(); } catch (e) { }
  }
  store.landmarker = null;
  input.reset();
  for (const it of [...store.items]) removeItem(it);
  store.hands = [];
  renderCursors([], { kindAt: () => null, progressOf: () => 0 });
  updatePartHover([]);
  await flushState();
  document.getElementById("ui").replaceChildren();
  document.getElementById("hud").classList.remove("visible");
  setBadge("");
  showEndScreen();
}

async function loadHandLandmarker() {
  const base = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MEDIAPIPE_VERSION;
  const { FilesetResolver, GestureRecognizer, HandLandmarker } = await import(base + "/vision_bundle.mjs");
  const vision = await FilesetResolver.forVisionTasks(base + "/wasm");
  const common = {
    runningMode: "VIDEO", numHands: 2,
    minHandDetectionConfidence: HANDS.MIN_DETECTION,
    minHandPresenceConfidence: HANDS.MIN_PRESENCE,
    minTrackingConfidence: HANDS.MIN_TRACKING,
  };
  try {
    return await GestureRecognizer.createFromOptions(vision, { baseOptions: { modelAssetPath: GESTURE_MODEL_URL }, ...common });
  } catch (e) {
    console.warn("[manos] GestureRecognizer no cargo; uso HandLandmarker", e);
    return HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: HAND_MODEL_URL }, ...common });
  }
}

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
  spawnStage();
  mountMenu();
  on("hud:toggle", toggleHud);
  on("app:exit", shutdown);
  on("palm:stop", ({ hand, item, paused }) => {
    pulseCursor(hand);
    if (!settings.autoSpin) toast("El giro automático está apagado (Menú › Vista)");
    else toast((paused ? "Giro detenido · " : "Giro reanudado · ") + (item.title || "modelo"));
  });
  on("palm:dial-start", ({ hand, item }) => {
    pulseCursor(hand);
    toast("Rotación activa · gira la muñeca para mover " + (item.title || "el modelo"), { ms: 1800 });
  });
  on("ui:click", ({ hand }) => {
    pulseCursor(hand);
    if (settings.clickSound) playClick();
  });
  window.addEventListener("keydown", onKeyDown);
  requestAnimationFrame(frame);

  await loadConfig();
  refreshCatalog();
  const calibrateNow = Q.get("calibrar") === "1";
  if (calibrateNow) startCalibration();
  if (REPLAY) await startReplay();
  else {
    if (!settings.tutorialDone && !calibrateNow) startTutorial();
    await startCamera();
  }
}
