// Plan de "exploded view" de un modelo por piezas (docs/04, applyExplode). Puro:
// no usa three.js, se prueba en Node (tests/run.mjs).
//
// Cada pieza se aleja del centro del modelo en la direccion de su propio centro:
// las lejanas viajan mas, y todas al menos `push` x diagonal (asi las piezas del
// centro tambien se separan). Las piezas GRANDES salen primero y las chicas
// despues (lag), como describe docs/04: se lee como un desarmado ordenado.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// parts: [{ center: [x, y, z], size }] en el espacio del modelo YA centrado en 0.
// diag:  diagonal del modelo completo.
// Devuelve, en el mismo orden: [{ offset: [x, y, z] (desplazamiento a f = 1), lag }].
export function explodePlan(parts, diag, { spread = 0.9, push = 0.15, maxLag = 0.5 } = {}) {
  const order = parts.map((p, i) => i).sort((a, b) => parts[b].size - parts[a].size);
  const rank = new Array(parts.length);
  order.forEach((idx, r) => { rank[idx] = r; });
  const n = Math.max(1, parts.length - 1);
  return parts.map((p, i) => {
    const [x, y, z] = p.center;
    const len = Math.hypot(x, y, z);
    // Una pieza justo en el centro no tiene direccion propia: sale hacia arriba.
    const dir = len > diag * 1e-4 ? [x / len, y / len, z / len] : [0, 1, 0];
    const dist = len * spread + diag * push;
    return { offset: [dir[0] * dist, dir[1] * dist, dir[2] * dist], lag: (rank[i] / n) * maxLag };
  });
}

// Cuanto de su recorrido hizo una pieza con lag `lag` cuando el modelo va en f (0..1).
export function partFactor(f, lag) {
  const t = clamp((f - lag) / (1 - lag), 0, 1);
  return t * t * (3 - 2 * t); // smoothstep
}
