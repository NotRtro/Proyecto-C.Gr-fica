import { CURSOR_CALIBRATION } from "../core/config.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((p, q) => p - q), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;

export function otsuSplit(values) {
  const s = [...values].sort((a, b) => a - b);
  let best = s[0], bestVar = -1;
  let sumL = 0;
  const total = s.reduce((a, b) => a + b, 0);
  for (let i = 1; i < s.length; i++) {
    sumL += s[i - 1];
    const nL = i, nR = s.length - i;
    const mL = sumL / nL, mR = (total - sumL) / nR;
    const v = nL * nR * (mL - mR) ** 2;
    if (v > bestVar) { bestVar = v; best = (s[i - 1] + s[i]) / 2; }
  }
  return best;
}

function openRuns(valid, isPinch, gapMs = 150) {
  const runs = [];
  let run = [];
  for (const s of valid) {
    const breaks = isPinch(s) || (run.length && s.t - run[run.length - 1].t > gapMs);
    if (breaks) { if (run.length) runs.push(run); run = []; }
    if (!isPinch(s)) run.push(s);
  }
  if (run.length) runs.push(run);
  return runs;
}

function stillestJitter(runs, windowMs, kx = "x", ky = "y") {
  let best = Infinity;
  for (const open of runs) {
    for (let i = 0; i < open.length; i++) {
      const win = [];
      for (let j = i; j < open.length && open[j].t - open[i].t <= windowMs; j++) win.push(open[j]);
      if (win.length < 8 || win[win.length - 1].t - win[0].t < windowMs * 0.8) continue;
      const cx = mean(win.map((s) => s[kx])), cy = mean(win.map((s) => s[ky]));
      const rms = Math.sqrt(mean(win.map((s) => (s[kx] - cx) ** 2 + (s[ky] - cy) ** 2)));
      best = Math.min(best, rms);
    }
  }
  return best;
}

function frameIntervalMs(samples) {
  const dts = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (b.rx !== a.rx || b.ry !== a.ry) dts.push(b.t - a.t);
  }
  return dts.length ? median(dts) : NaN;
}

export function minCutoffFor(rawJitterPx, frameMs, targetPx = CURSOR_CALIBRATION.TARGET_JITTER_PX) {
  const { MIN_CUTOFF_MIN: lo, MIN_CUTOFF_MAX: hi } = CURSOR_CALIBRATION;
  if (!(rawJitterPx > targetPx) || !(frameMs > 0)) return hi;
  const r = (targetPx / rawJitterPx) ** 2;
  const a = (2 * r) / (1 + r);
  const fc = a / (2 * Math.PI * (frameMs / 1000) * (1 - a));
  return +clamp(fc, lo, hi).toFixed(2);
}

export function analyzeHand(samples, { stillWindowMs = 1000 } = {}) {
  const warnings = [];
  const valid = samples.filter((s) => Number.isFinite(s.ratio) && Number.isFinite(s.x));
  if (valid.length < 30) return { ok: false, reason: "Muy pocas muestras de la mano (" + valid.length + ").", warnings };

  const split = otsuSplit(valid.map((s) => s.ratio));
  const isPinch = (s) => s.ratio < split;
  const open = valid.filter((s) => !isPinch(s));
  const pinch = valid.filter(isPinch);
  if (open.length < 15 || pinch.length < 10) {
    return { ok: false, reason: "Falta " + (open.length < 15 ? "la mano abierta" : "el pinch") + " en las muestras.", warnings };
  }
  const ratioOpen = median(open.map((s) => s.ratio));
  const ratioPinch = median(pinch.map((s) => s.ratio));
  if (ratioPinch > 0.3) {
    return { ok: false, reason: "No se detecto un pinch: junta el pulgar y el indice hasta que se toquen.", warnings };
  }
  if (ratioOpen < ratioPinch * 2 || ratioOpen - ratioPinch < 0.15) {
    return { ok: false, reason: "No se distingue bien la mano abierta del pinch: junta mas los dedos al hacer pinch y separalos mas al soltar.", warnings };
  }

  const jitterPx = stillestJitter(openRuns(valid, isPinch), stillWindowMs);
  if (!Number.isFinite(jitterPx)) {
    return { ok: false, reason: "No hubo 1 segundo seguido con la mano abierta y quieta.", warnings };
  }

  const hasRaw = valid.every((s) => Number.isFinite(s.rx) && Number.isFinite(s.ry));
  const rawJitterPx = hasRaw ? stillestJitter(openRuns(valid, isPinch), stillWindowMs, "rx", "ry") : NaN;
  const frameMs = hasRaw ? frameIntervalMs(valid) : NaN;

  const jumps = [];
  for (let i = 3; i < valid.length - 4; i++) {
    if (!isPinch(valid[i - 1]) && isPinch(valid[i])) {
      const before = valid.slice(i - 3, i), after = valid.slice(i + 1, i + 4);
      if (after.some((s) => !isPinch(s))) continue;
      jumps.push(Math.hypot(mean(after.map((s) => s.x)) - mean(before.map((s) => s.x)),
        mean(after.map((s) => s.y)) - mean(before.map((s) => s.y))));
    }
  }
  const jumpPx = jumps.length ? median(jumps) : NaN;
  const spanPx = median(valid.map((s) => s.span).filter(Number.isFinite));

  if (jitterPx > 10) warnings.push("La mano tiembla mucho en pantalla (" + jitterPx.toFixed(1) + " px): mejora la luz o apoya el codo.");
  if (jumps.length < 3) warnings.push("Hubo pocos pinch para medir el salto del cursor (" + jumps.length + ").");
  if (spanPx < 60) warnings.push("La mano se ve chica: acercate un poco a la camara.");

  const ratioEnter = clamp(ratioPinch + 0.45 * (ratioOpen - ratioPinch), 0.18, 0.5);
  const ratioHold = clamp(ratioPinch + 0.6 * (ratioOpen - ratioPinch), ratioEnter + 0.06, 0.62);
  return {
    ok: true, warnings,
    jitterPx, rawJitterPx, frameMs, ratioOpen, ratioPinch, jumpPx, spanPx, transitions: jumps.length,
    suggest: {
      ratioEnter: +ratioEnter.toFixed(3),
      ratioHold: +ratioHold.toFixed(3),
      hysteresisPx: clamp(Math.round(3 * jitterPx), 6, 20),
      travelMinPx: clamp(Math.round(4 * jitterPx), 30, 60),
      ...(Number.isFinite(rawJitterPx) ? { minCutoff: minCutoffFor(rawJitterPx, frameMs) } : {}),
    },
  };
}
