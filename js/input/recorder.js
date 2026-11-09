const r4 = (v) => Math.round(v * 10000) / 10000;
const r5 = (v) => Math.round(v * 100000) / 100000;

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
        hands: detections.map((d) => ({
          label: d.label, lm: d.lm.map((p) => [r4(p.x), r4(p.y), r4(p.z || 0)]),
          ...(d.wl ? { wl: d.wl.map((p) => [r5(p.x), r5(p.y), r5(p.z)]) } : {}),
          ...(d.gesture ? { g: [d.gesture.name, r4(d.gesture.score)] } : {}),
        })),
      });
    },
    stop() { const out = rec; rec = null; return out; },
  };
}

export function frameToDetections(frame) {
  return frame.hands.map((h) => ({
    label: h.label, lm: h.lm.map(([x, y, z]) => ({ x, y, z })),
    wl: h.wl ? h.wl.map(([x, y, z]) => ({ x, y, z })) : null,
    gesture: h.g ? { name: h.g[0], score: h.g[1] } : null,
  }));
}

export function createReplaySource(rec, { loopGapMs = 600, onLoop = () => {}, step = false } = {}) {
  const video = { videoWidth: rec.video.w, videoHeight: rec.video.h };
  const lastT = rec.frames.length ? rec.frames[rec.frames.length - 1].t : 0;
  const FRAME_MS = 33;
  let t0 = null, idx = -1;
  let base = 0, gap = 0, vt = 0;

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
