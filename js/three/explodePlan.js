const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function explodePlan(parts, diag, { spread = 0.9, push = 0.15, maxLag = 0.5 } = {}) {
  const order = parts.map((p, i) => i).sort((a, b) => parts[b].size - parts[a].size);
  const rank = new Array(parts.length);
  order.forEach((idx, r) => { rank[idx] = r; });
  const n = Math.max(1, parts.length - 1);
  return parts.map((p, i) => {
    const [x, y, z] = p.center;
    const len = Math.hypot(x, y, z);
    const dir = len > diag * 1e-4 ? [x / len, y / len, z / len] : [0, 1, 0];
    const dist = len * spread + diag * push;
    return { offset: [dir[0] * dist, dir[1] * dist, dir[2] * dist], lag: (rank[i] / n) * maxLag };
  });
}

export function partFactor(f, lag) {
  const t = clamp((f - lag) / (1 - lag), 0, 1);
  return t * t * (3 - 2 * t);
}
