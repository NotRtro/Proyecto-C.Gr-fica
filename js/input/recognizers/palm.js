// Gestos de palma (fase 7, paso 7B). Funciones puras: landmarks -> numeros y una
// maquina de estados por mano. Sin DOM ni estado global.
//
//   "stop"  palma de "alto" (como un policia de transito): los cuatro dedos
//           estirados EN el plano de la imagen y la mano vertical. Quieta
//           PALM.STOP_MS -> se dispara una vez (detener / reanudar el giro).
//   "dial"  palma "perilla": dedos estirados apuntando a la camara. Girar la
//           muneca a la derecha/izquierda gira el modelo (angulo de la linea de
//           nudillos indice -> menique).
//
// Para "dial" hace falta la profundidad: MediaPipe da z por landmark con origen
// en la muneca (menor = mas cerca de la camara) y en unidades del ANCHO de la
// imagen, como x.
import { dist } from "../../core/util.js";
import { PALM, PINCH } from "../../core/config.js";
import { toVideoPx } from "../coords.js";
import { fingerExtensions } from "./pinch.js";

const TIPS = [8, 12, 16, 20], MCPS = [5, 9, 13, 17];

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function palmMetrics(lm, video) {
  const P = lm.map((p) => ({ ...toVideoPx(p, video), z: (p.z || 0) * video.videoWidth }));
  const span = Math.max(dist(P[0], P[9]), 1e-3);
  const palmW = Math.max(dist(P[5], P[17]), 1e-3);
  const { f8, f12, f16, f20 } = fingerExtensions(P);
  // extension en 2D: el dedo se ve largo en la imagen (no acortado por la perspectiva)
  const ext2 = Math.min(f8, f12, f16, f20);
  // extension en 3D: el dedo esta estirado aunque apunte a la camara
  const ext3 = TIPS.reduce((s, t, i) => s + dist3(P[t], P[0]) / Math.max(dist3(P[MCPS[i]], P[0]), 1e-3), 0) / 4;
  // cuanto mas cerca de la camara estan las puntas que la muneca, en anchos de palma
  const depth = TIPS.reduce((s, t) => s + (P[0].z - P[t].z), 0) / 4 / palmW;
  // 0 = mano vertical con los dedos hacia arriba
  const tilt = Math.abs(Math.atan2(P[9].x - P[0].x, P[0].y - P[9].y));
  const ratio = dist(P[4], P[8]) / span;
  return { ext2, ext3, depth, tilt, ratio, span };
}

// Histeresis: entrar a una pose exige mas que mantenerla.
export function palmPose(prev, m) {
  const hold = (pose) => prev === pose;
  const noPinch = m.ratio > PINCH.RATIO_HOLD;
  const stop = m.ext2 > (hold("stop") ? PALM.STOP_EXT_HOLD : PALM.STOP_EXT_ENTER)
    && m.tilt < (hold("stop") ? PALM.STOP_TILT_HOLD : PALM.STOP_TILT_ENTER) && noPinch;
  if (stop) return "stop";
  const dial = m.depth > (hold("dial") ? PALM.DIAL_DEPTH_HOLD : PALM.DIAL_DEPTH_ENTER)
    && m.ext3 > PALM.DIAL_EXT3 && noPinch;
  return dial ? "dial" : null;
}

export function createPalmState() {
  return { pose: null, raw: null, pending: 0, since: 0, anchor: null, fired: false, angle: 0 };
}

// Avanza un frame de camara (solo con la mano SIN pinch).
//   center: centro de la palma en pantalla {x, y}; spanPx: tamano de la mano en pantalla
//   angle:  angulo de la linea de nudillos en pantalla (rad, horario positivo)
// Devuelve { pose, progress (0..1 de "stop"), fired (true el frame en que se dispara), angle }.
export function stepPalm(st, m, now, center, spanPx, angle) {
  const raw = palmPose(st.pose, m);
  if (raw === st.pose) st.pending = 0;
  else if (++st.pending >= PALM.CONFIRM_FRAMES) {
    st.pose = raw; st.pending = 0;
    st.since = now; st.anchor = { ...center }; st.fired = false;
  }
  // Mientras se confirma la salida de una pose la mano ya cambio de forma y su
  // linea de nudillos no es la de la perilla: el angulo queda congelado.
  if (raw === st.pose) st.angle = angle;
  let progress = 0, fired = false;
  if (st.pose === "stop") {
    // quieta: si la palma se mueve, la cuenta vuelve a empezar
    if (dist(center, st.anchor) > PALM.STILL_SPAN * spanPx) { st.since = now; st.anchor = { ...center }; }
    progress = Math.min(1, (now - st.since) / PALM.STOP_MS);
    if (progress >= 1 && !st.fired) { st.fired = true; fired = true; }
    if (st.fired) progress = 0;
  }
  return { pose: st.pose, progress, fired, angle: st.angle };
}

// Saca la mano de cualquier pose (pinch, mano perdida).
export function resetPalm(st) { st.pose = null; st.pending = 0; st.fired = false; }
