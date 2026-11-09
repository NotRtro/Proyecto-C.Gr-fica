function alpha(cutoffHz, dtS) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtS);
}

export function createOneEuro({ minCutoff, beta, dCutoff }) {
  let x = null, dx = 0, tPrev = null;
  return {
    filter(value, tMs) {
      if (x === null) { x = value; tPrev = tMs; return x; }
      const dt = Math.max((tMs - tPrev) / 1000, 1e-3);
      tPrev = tMs;
      const rawDx = (value - x) / dt;
      dx += alpha(dCutoff, dt) * (rawDx - dx);
      const cutoff = minCutoff + beta * Math.abs(dx);
      x += alpha(cutoff, dt) * (value - x);
      return x;
    },
    reset() { x = null; dx = 0; tPrev = null; },
  };
}

export function createPointFilter(opts) {
  const fx = createOneEuro(opts), fy = createOneEuro(opts);
  return {
    filter(p, tMs) { return { x: fx.filter(p.x, tMs), y: fy.filter(p.y, tMs) }; },
    reset() { fx.reset(); fy.reset(); },
  };
}
