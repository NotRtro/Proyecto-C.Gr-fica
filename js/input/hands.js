// Seguimiento de manos con identidad estable. MediaPipe no garantiza el orden de
// las manos y a veces intercambia la etiqueta Left/Right; si se usara esa
// etiqueta como ID, un objeto agarrado se soltaria a mitad del gesto.
//
// Aqui cada deteccion se asocia a la mano del frame anterior mas cercana (por
// posicion de la muneca). Una mano que desaparece por un instante conserva su
// ID durante HANDS.LOST_GRACE_MS. La lateralidad se decide por votacion.
//
// Entrada: [{ lm: [21 landmarks], label: "Left"|"Right" }]
// Salida:  [{ id, lm, handedness, present, lastSeen }]
import { HANDS } from "../core/config.js";

export function createHandTracker() {
  let tracks = [];
  let nextId = 1;

  function vote(track) {
    const n = track.labels.filter((l) => l === "Right").length;
    return n * 2 >= track.labels.length ? "Right" : "Left";
  }

  function update(detections, now) {
    const pairs = [];
    detections.forEach((d, di) => {
      tracks.forEach((t, ti) => {
        const dd = Math.hypot(d.lm[0].x - t.lm[0].x, d.lm[0].y - t.lm[0].y);
        if (dd <= HANDS.MATCH_MAX) pairs.push({ di, ti, dd });
      });
    });
    pairs.sort((a, b) => a.dd - b.dd);

    const usedD = new Set(), usedT = new Set();
    for (const p of pairs) {
      if (usedD.has(p.di) || usedT.has(p.ti)) continue;
      usedD.add(p.di); usedT.add(p.ti);
      const t = tracks[p.ti], d = detections[p.di];
      t.lm = d.lm; t.present = true; t.lastSeen = now;
      if (d.label) {
        t.labels.push(d.label);
        if (t.labels.length > HANDS.HANDEDNESS_WINDOW) t.labels.shift();
      }
      t.handedness = vote(t);
    }

    tracks.forEach((t, ti) => { if (!usedT.has(ti)) t.present = false; });
    tracks = tracks.filter((t) => t.present || now - t.lastSeen <= HANDS.LOST_GRACE_MS);

    detections.forEach((d, di) => {
      if (usedD.has(di)) return;
      const t = { id: "h" + (nextId++), lm: d.lm, present: true, lastSeen: now,
        labels: d.label ? [d.label] : [], handedness: d.label || "Right" };
      tracks.push(t);
    });

    return tracks.map((t) => ({ id: t.id, lm: t.lm, handedness: t.handedness, present: t.present, lastSeen: t.lastSeen }));
  }

  return { update, reset() { tracks = []; } };
}

// Convierte el resultado de HandLandmarker.detectForVideo al formato de entrada.
export function detectionsFromMediaPipe(res) {
  const hands = res.landmarks || [];
  const handedness = res.handedness || [];
  return hands.map((lm, i) => ({
    lm, label: (handedness[i] && handedness[i][0] && handedness[i][0].categoryName) || null,
  }));
}
