// Grabacion y reproduccion de sesiones de manos. Una grabacion guarda los
// landmarks crudos de MediaPipe por frame; reproducirla (?replay=nombre) alimenta
// la tuberia exactamente como la camara. Sirve para probar gestos sin pararse
// frente a la webcam y para los tests automaticos (tests/run.mjs).
//
// Formato: { version: 1, video: {w, h}, frames: [{ t: ms, hands: [{ label, lm: [[x,y,z] x21] }] }],
//            setup?: [comandos /cmd a aplicar al empezar cada vuelta, p. ej. add_card] }

const r4 = (v) => Math.round(v * 10000) / 10000;

export function createRecorder() {
  let rec = null, t0 = 0;
  return {
    active: () => rec !== null,
    frames: () => (rec ? rec.frames.length : 0),
    start(video) {
      rec = { version: 1, created: new Date().toISOString(),
        video: { w: video.videoWidth, h: video.videoHeight }, frames: [] };
      t0 = null;
    },
    push(detections, now) {
      if (!rec) return;
      if (t0 === null) t0 = now;
      rec.frames.push({
        t: Math.round(now - t0),
        hands: detections.map((d) => ({ label: d.label, lm: d.lm.map((p) => [r4(p.x), r4(p.y), r4(p.z || 0)]) })),
      });
    },
    stop() { const out = rec; rec = null; return out; },
  };
}

export function frameToDetections(frame) {
  return frame.hands.map((h) => ({ label: h.label, lm: h.lm.map(([x, y, z]) => ({ x, y, z })) }));
}

// Fuente de reproduccion en bucle. next(now) devuelve detecciones solo cuando
// avanza a un frame nuevo (igual que una camara real), o null si no.
// onLoop() se llama al empezar cada vuelta (incluida la primera) para que el
// tracker reinicie la escena: los gestos son relativos, y sin reinicio cada
// vuelta acumularia su efecto (escala x2, x4, ...).
//
// step: true = modo CUADRO A CUADRO: cada llamada avanza exactamente un frame de
// la grabacion y clock() devuelve el tiempo de la grabacion (no el del reloj).
// El resultado no depende de la velocidad del navegador: si la pagina pinta a
// saltos (pestana en segundo plano, panel de pruebas), igual no se pierde ningun
// gesto. Se activa con ?replay=<nombre>&step=1.
export function createReplaySource(rec, { loopGapMs = 600, onLoop = () => {}, step = false } = {}) {
  const video = { videoWidth: rec.video.w, videoHeight: rec.video.h };
  const lastT = rec.frames.length ? rec.frames[rec.frames.length - 1].t : 0;
  const FRAME_MS = 33;
  let t0 = null, idx = -1;
  let base = 0, gap = 0, vt = 0; // modo cuadro a cuadro

  function nextRealtime(now) {
    if (t0 === null) { t0 = now; onLoop(); }
    const el = now - t0;
    if (el > lastT + loopGapMs) { t0 = now; idx = -1; onLoop(); return []; }
    let j = idx;
    while (j + 1 < rec.frames.length && rec.frames[j + 1].t <= el) j++;
    if (j === idx || j < 0) return null;
    idx = j;
    return frameToDetections(rec.frames[j]);
  }

  function nextStep() {
    if (idx === -1 && gap === 0) onLoop();
    if (idx + 1 < rec.frames.length) {
      idx++;
      vt = base + rec.frames[idx].t;
      return frameToDetections(rec.frames[idx]);
    }
    // pausa entre vueltas: frames sin manos
    vt += FRAME_MS;
    if (++gap * FRAME_MS >= loopGapMs) { base = vt + FRAME_MS; idx = -1; gap = 0; }
    return [];
  }

  return {
    video, step,
    next: step ? nextStep : nextRealtime,
    clock: (now) => (step ? vt : now),
  };
}

export async function loadRecording(name) {
  const res = await fetch("/recordings/" + encodeURIComponent(name) + ".json", { cache: "no-store" });
  if (!res.ok) throw new Error("no existe la grabacion '" + name + "' (" + res.status + ")");
  return res.json();
}

export function downloadJson(obj, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
