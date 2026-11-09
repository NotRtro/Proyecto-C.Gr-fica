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
      t.lm = d.lm; t.wl = d.wl || null; t.gesture = d.gesture || null;
      t.present = true; t.lastSeen = now;
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
      const t = { id: "h" + (nextId++), lm: d.lm, wl: d.wl || null, gesture: d.gesture || null,
        present: true, lastSeen: now,
        labels: d.label ? [d.label] : [], handedness: d.label || "Right" };
      tracks.push(t);
    });

    return tracks.map((t) => ({ id: t.id, lm: t.lm, wl: t.wl, gesture: t.gesture,
      handedness: t.handedness, present: t.present, lastSeen: t.lastSeen }));
  }

  return { update, reset() { tracks = []; } };
}

const SWAP = { Left: "Right", Right: "Left" };

export function detectionsFromMediaPipe(res) {
  const hands = res.landmarks || [];
  const handedness = res.handedness || [];
  const world = res.worldLandmarks || [];
  const gestures = res.gestures || [];
  return hands.map((lm, i) => {
    const raw = handedness[i] && handedness[i][0] && handedness[i][0].categoryName;
    const g = gestures[i] && gestures[i][0];
    return {
      lm, label: SWAP[raw] || null,
      wl: world[i] || null,
      gesture: g ? { name: g.categoryName, score: g.score } : null,
    };
  });
}
