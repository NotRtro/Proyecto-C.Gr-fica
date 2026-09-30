// Geometria procedural del reactor (puerto de make_reactor/_expand en
// core/hologram.py). Triangle soup no indexado con atributos custom:
//   barycentric -> wireframe en el fragment shader sin geometria de lineas
//   pivot       -> direccion de explode de cada parte
import * as THREE from "three";

function torusGeom(R, r, nu, nv) {
  const P = [], N = [];
  for (let i = 0; i < nu; i++) {
    const u = (i / nu) * Math.PI * 2;
    for (let j = 0; j < nv; j++) {
      const v = (j / nv) * Math.PI * 2;
      const cx = (R + r * Math.cos(v)) * Math.cos(u);
      const cy = (R + r * Math.cos(v)) * Math.sin(u);
      const cz = r * Math.sin(v);
      P.push([cx, cy, cz]);
      N.push([Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), Math.sin(v)]);
    }
  }
  const F = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * nv + j;
      const b = ((i + 1) % nu) * nv + j;
      const c = ((i + 1) % nu) * nv + ((j + 1) % nv);
      const d = i * nv + ((j + 1) % nv);
      F.push([a, b, c], [a, c, d]);
    }
  }
  return { P, N, F };
}

function icosphereGeom(radius, subdiv) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  let f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a + "_" + b : b + "_" + a;
      if (!cache.has(k)) {
        cache.set(k, v.length);
        v.push([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]);
      }
      return cache.get(k);
    };
    const nf = [];
    for (const [a, b, c] of f) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  const N = v.map((p) => {
    const len = Math.hypot(p[0], p[1], p[2]) || 1;
    return [p[0] / len, p[1] / len, p[2] / len];
  });
  const P = N.map((n) => [n[0] * radius, n[1] * radius, n[2] * radius]);
  return { P, N, F: f };
}

function rotY(p, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
}

function transformPart(P, N, offset, scale, rotYAng) {
  const P2 = P.map((p) => {
    const r = rotY([p[0] * scale, p[1] * scale, p[2] * scale], rotYAng);
    return [r[0] + offset[0], r[1] + offset[1], r[2] + offset[2]];
  });
  const N2 = N.map((n) => rotY(n, rotYAng));
  return { P: P2, N: N2 };
}

function makeReactorParts() {
  const parts = [];
  { const { P, N, F } = icosphereGeom(0.9, 1); parts.push({ P, N, F, pivot: [0, 0, 0] }); }
  { const { P, N, F } = torusGeom(1.7, 0.16, 30, 7); parts.push({ P, N, F, pivot: [0, 0, 1] }); }
  { const { P, N, F } = torusGeom(2.6, 0.20, 36, 7); parts.push({ P, N, F, pivot: [0, 0, -1] }); }
  {
    let coilsP = [], coilsN = [], coilsF = [], base = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k * 2 * Math.PI) / 8;
      const g = torusGeom(0.34, 0.11, 12, 6);
      const off = [Math.cos(a) * 2.15, Math.sin(a) * 2.15, 0];
      const t = transformPart(g.P, g.N, off, 1.0, a);
      coilsP = coilsP.concat(t.P);
      coilsN = coilsN.concat(t.N);
      coilsF = coilsF.concat(g.F.map((tri) => tri.map((idx) => idx + base)));
      base += g.P.length;
    }
    parts.push({ P: coilsP, N: coilsN, F: coilsF, pivot: [0, 1, 0] });
  }
  { const { P, N, F } = torusGeom(3.3, 0.10, 40, 6); parts.push({ P, N, F, pivot: [0, -1, 0] }); }
  return parts;
}

export function buildReactorGeometry() {
  const parts = makeReactorParts();
  const positions = [], normals = [], barys = [], pivots = [];
  for (const { P, N, F, pivot } of parts) {
    for (const tri of F) {
      for (let k = 0; k < 3; k++) {
        const idx = tri[k];
        positions.push(P[idx][0], P[idx][1], P[idx][2]);
        normals.push(N[idx][0], N[idx][1], N[idx][2]);
        barys.push(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0);
        pivots.push(pivot[0], pivot[1], pivot[2]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("barycentric", new THREE.Float32BufferAttribute(barys, 3));
  geo.setAttribute("pivot", new THREE.Float32BufferAttribute(pivots, 3));
  return geo;
}
