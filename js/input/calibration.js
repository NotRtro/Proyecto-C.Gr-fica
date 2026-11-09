import { CURSOR_CALIBRATION, PINCH_CALIBRATION } from "../core/config.js";
import { pinchGates, pinchKind } from "./recognizers/pinch.js";

export const PROTOCOL = [
  { phase: "open", ms: 3000 },
  { phase: "pinch", ms: 2000 },
  { phase: "taps", ms: 5000 },
  { phase: "fist", ms: 2000 },
  { phase: "relaxed", ms: 2000 },
];

const IMPOSTOR_PHASES = new Set(["fist", "relaxed"]);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((p, q) => p - q), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
const percentile = (a, q) => {
  if (!a.length) return NaN;
  const s = [...a].sort((p, r) => p - r);
  return s[Math.round(q * (s.length - 1))];
};
const share = (list, fn) => (list.length ? list.filter(fn).length / list.length : 0);

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

function fitCut(pinch, impostors, key, [lo, hi], drop, current) {
  const pLow = percentile(pinch.map((s) => s[key]), 0.1);
  const iHigh = impostors.length ? percentile(impostors.map((s) => s[key]), 0.9) : -Infinity;
  if (!(pLow - iHigh >= PINCH_CALIBRATION.MIN_GAP)) return null;
  const enter = Number.isFinite(iHigh)
    ? clamp((pLow + iHigh) / 2, lo, hi)
    : clamp(Math.min(current, pLow - PINCH_CALIBRATION.MIN_GAP), lo, hi);
  const hold = Number.isFinite(iHigh) ? Math.max(enter - drop, (iHigh + enter) / 2) : enter - drop;
  return { enter: +enter.toFixed(3), hold: +Math.min(hold, enter).toFixed(3) };
}

function fitClosedRatio(pinch, impostors, g) {
  const passes = (s) => s.f8 > g.f8Enter;
  const own = pinch.filter(passes);
  if (own.length < PINCH_CALIBRATION.MIN_SAMPLES) return null;
  const pHigh = percentile(own.map((s) => s.ratio), 0.9);
  const rivals = impostors.filter(passes);
  const iLow = rivals.length ? percentile(rivals.map((s) => s.ratio), 0.1) : Infinity;
  if (!(iLow - pHigh >= PINCH_CALIBRATION.MIN_GAP)) return null;
  const [lo, hi] = PINCH_CALIBRATION.CLOSED_K_RANGE;
  const curEnter = g.ratioEnter * g.closedEnterK, curHold = g.ratioHold * g.closedHoldK;
  const enter = clamp(Number.isFinite(iLow) ? (pHigh + iLow) / 2 : Math.max(curEnter, pHigh + PINCH_CALIBRATION.MIN_GAP),
    lo * g.ratioEnter, hi * g.ratioEnter);
  const hold = Number.isFinite(iLow) ? Math.min(enter + (curHold - curEnter), (enter + iLow) / 2) : enter + (curHold - curEnter);
  return {
    enter: +(enter / g.ratioEnter).toFixed(3),
    hold: +(Math.max(hold, enter) / g.ratioHold).toFixed(3),
  };
}

export function fitPinchGates(pinch, impostors, base) {
  const accepts = (g) => (s) => pinchKind(false, s, g) !== null;
  const score = (g) => ({ detect: share(pinch, accepts(g)), falseRate: share(impostors, accepts(g)) });
  const before = score(base);
  if (before.detect >= PINCH_CALIBRATION.GOOD_DETECT && before.falseRate <= PINCH_CALIBRATION.MAX_FALSE) {
    return { gates: base, ...before, changed: [] };
  }
  const g = { ...base };
  const changed = [];
  const apply = (cut, enterKey, holdKey) => {
    if (!cut) return;
    g[enterKey] = cut.enter; g[holdKey] = cut.hold;
    changed.push(enterKey);
  };
  const okImpostors = impostors.filter((s) => s.ratio < base.ratioEnter);
  apply(fitCut(pinch, okImpostors, "backMean", PINCH_CALIBRATION.BACK_RANGE, base.backEnter - base.backHold, base.backEnter),
    "backEnter", "backHold");
  apply(fitCut(pinch, okImpostors, "arch", PINCH_CALIBRATION.ARCH_RANGE, base.archEnter - base.archHold, base.archEnter),
    "archEnter", "archHold");
  const closedImpostors = impostors.filter((s) => s.ratio < base.ratioEnter * base.closedEnterK);
  apply(fitCut(pinch, closedImpostors, "f8", PINCH_CALIBRATION.F8_RANGE, base.f8Enter - base.f8Hold, base.f8Enter),
    "f8Enter", "f8Hold");
  apply(fitClosedRatio(pinch, impostors, g), "closedEnterK", "closedHoldK");
  const after = score(g);
  const better = after.detect > before.detect && after.falseRate <= Math.max(before.falseRate, PINCH_CALIBRATION.MAX_FALSE);
  return better ? { gates: g, ...after, changed } : { gates: base, ...before, changed: [] };
}

export function fistModelStats(pinch, fist) {
  const named = (list) => list.filter((s) => typeof s.model === "string");
  const p = named(pinch), f = named(fist);
  if (p.length < PINCH_CALIBRATION.MIN_SAMPLES || f.length < PINCH_CALIBRATION.MIN_SAMPLES) return null;
  const isFist = (s) => s.model === "Closed_Fist";
  const pinchAsFist = share(p, isFist), fistAsFist = share(f, isFist);
  return {
    pinchAsFist, fistAsFist,
    useful: pinchAsFist <= PINCH_CALIBRATION.MAX_FALSE && fistAsFist >= PINCH_CALIBRATION.FIST_MODEL_MIN,
  };
}

export function analyzeHand(samples, { stillWindowMs = 1000 } = {}) {
  const warnings = [];
  const impostors = samples.filter((s) => IMPOSTOR_PHASES.has(s.phase) && Number.isFinite(s.ratio));
  const valid = samples.filter((s) => !IMPOSTOR_PHASES.has(s.phase) && Number.isFinite(s.ratio) && Number.isFinite(s.x));
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

  const hasShape = (s) => Number.isFinite(s.arch) && Number.isFinite(s.backMean) && Number.isFinite(s.f8);
  const sustained = pinch.filter((s) => s.phase === "pinch");
  const shapePinch = (sustained.length >= 10 ? sustained : pinch).filter(hasShape);
  let fit = null;
  if (shapePinch.length >= PINCH_CALIBRATION.MIN_SAMPLES) {
    const base = { ...pinchGates(), ratioEnter, ratioHold };
    fit = fitPinchGates(shapePinch, impostors.filter(hasShape), base);
    if (fit.detect < PINCH_CALIBRATION.WARN_DETECT) {
      warnings.push("Tu pinch se reconoce solo " + Math.round(fit.detect * 100) + " % de las veces: junta bien las puntas y estira o recoge del todo los otros tres dedos.");
    }
    if (fit.falseRate > PINCH_CALIBRATION.MAX_FALSE) {
      warnings.push("El puño o la mano relajada se toman por pinch " + Math.round(fit.falseRate * 100) + " % de las veces: al hacer pinch, separa más los otros dedos.");
    }
  }
  const g = fit && fit.gates;
  const model = fistModelStats(sustained, impostors.filter((s) => s.phase === "fist"));

  return {
    ok: true, warnings,
    jitterPx, rawJitterPx, frameMs, ratioOpen, ratioPinch, jumpPx, spanPx, transitions: jumps.length,
    pinchDetect: fit ? fit.detect : NaN,
    impostorRate: fit && impostors.length ? fit.falseRate : NaN,
    gatesChanged: fit ? fit.changed : [],
    modelPinchAsFist: model ? model.pinchAsFist : NaN,
    modelFistAsFist: model ? model.fistAsFist : NaN,
    suggest: {
      ratioEnter: +ratioEnter.toFixed(3),
      ratioHold: +ratioHold.toFixed(3),
      ...(g ? {
        archEnter: g.archEnter, archHold: g.archHold,
        backEnter: g.backEnter, backHold: g.backHold,
        f8Enter: g.f8Enter, f8Hold: g.f8Hold,
        closedEnterK: g.closedEnterK, closedHoldK: g.closedHoldK,
      } : {}),
      fistVeto: !!(model && model.useful),
      hysteresisPx: clamp(Math.round(3 * jitterPx), 6, 20),
      travelMinPx: clamp(Math.round(4 * jitterPx), 30, 60),
      ...(Number.isFinite(rawJitterPx) ? { minCutoff: minCutoffFor(rawJitterPx, frameMs) } : {}),
    },
  };
}
