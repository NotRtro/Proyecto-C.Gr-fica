// Piezas de un modelo (fase 7). Puro: no usa three.js, se prueba en Node.
//
// Una PIEZA es un ensamble de la jerarquia del glTF, no cada malla: una rueda
// hecha de llanta + rin + buje se mueve entera. Sirve para cualquier modelo que
// venga separado en objetos; el manifest (7E) solo agrega nombres y orden.
//
// El arbol se describe con nodos { mesh: bool, children: [nodo...] } (solo nodos
// del glTF: las primitivas de una malla son parte de su nodo, no hijos).
import { PIECES } from "../core/config.js";

function meshesBelow(n) {
  let c = n.mesh ? 1 : 0;
  for (const k of n.children) c += meshesBelow(k);
  return c;
}

// Devuelve los nodos que son piezas, en el orden de la jerarquia.
//   1. Se bajan los "envoltorios" (nodos sin malla con un solo hijo con mallas).
//   2. Las piezas son los hijos (con mallas) del primer nodo que se ramifica. Si
//      ese nodo tiene malla propia, queda como BASE fija (no es pieza).
//   3. Si quedan muy pocas piezas, se abre la mas grande en sus hijos (un modelo
//      con "carroceria" y "ruedas" como unicos hijos se puede desarmar igual).
//      Solo se abren nodos sin malla propia: si no, al mover el nodo se moverian
//      tambien sus hijos, que ya serian otras piezas.
export function findPieces(root) {
  const withMeshes = (n) => n.children.filter((k) => meshesBelow(k) > 0);
  let n = root;
  while (!n.mesh && withMeshes(n).length === 1) n = withMeshes(n)[0];
  let pieces = withMeshes(n);
  if (!pieces.length) return n.mesh ? [n] : [];
  while (pieces.length < PIECES.MIN_COUNT) {
    const openable = pieces.filter((p) => !p.mesh && withMeshes(p).length > 0);
    if (!openable.length) break;
    const big = openable.reduce((a, b) => (meshesBelow(b) > meshesBelow(a) ? b : a));
    const i = pieces.indexOf(big);
    pieces = [...pieces.slice(0, i), ...withMeshes(big), ...pieces.slice(i + 1)];
  }
  return pieces;
}

// Nombre legible a partir del nombre del nodo ("Wheel_FL.001" -> "Wheel FL").
// null si no hay nombre util (nodos sin nombre o nombres automaticos).
export function prettyName(raw) {
  if (!raw) return null;
  const s = String(raw)
    .replace(/\.\d+$/, "")          // sufijos de Blender: .001
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || /^(node|mesh|object|group|empty)?\s*\d*$/i.test(s)) return null;
  return s;
}

// Donde vive el manifest de un modelo (mismo criterio que server.py list_models):
//   models/Buggy.glb            -> models/Buggy.json
//   models/bicicleta/model.glb  -> models/bicicleta/manifest.json
export function manifestPathFor(src) {
  if (/(^|\/)model\.(glb|gltf)$/i.test(src)) return src.replace(/model\.(glb|gltf)$/i, "manifest.json");
  return src.replace(/\.(glb|gltf)$/i, ".json");
}

// Agrupa las piezas automaticas (findPieces, numeradas desde 1 como "Pieza N")
// segun manifest.pieces = [{ label, parts: [N, ...] }, ...]. Las que el manifest
// no menciona quedan como piezas sueltas, salvo que manifest.rest nombre el grupo
// que se las lleva. Numeros invalidos o repetidos se ignoran.
// Devuelve [{ label (o null), members: [indice 0..count-1, ...] }]: primero los
// grupos del manifest, en su orden (es el orden del armado guiado).
export function groupPieces(count, manifest) {
  const groups = [];
  const used = new Set();
  const list = manifest && Array.isArray(manifest.pieces) ? manifest.pieces : [];
  for (const g of list) {
    const members = [];
    for (const n of Array.isArray(g.parts) ? g.parts : []) {
      const i = Number(n) - 1;
      if (Number.isInteger(i) && i >= 0 && i < count && !used.has(i)) { used.add(i); members.push(i); }
    }
    if (members.length) groups.push({ label: g.label ? String(g.label) : null, members });
  }
  const restGroup = manifest && manifest.rest ? groups.find((g) => g.label === manifest.rest) : null;
  for (let i = 0; i < count; i++) {
    if (used.has(i)) continue;
    if (restGroup) restGroup.members.push(i);
    else groups.push({ label: null, members: [i] });
  }
  return groups;
}

// ---- armado guiado (fase 7E) -------------------------------------------------

// Orden de armado: con manifest, el de sus piezas (groupPieces ya las deja
// primero y en orden); sin manifest, de la mas grande a la mas chica (lag del
// explode: 0 = la mas grande), que suele ser de la base a los detalles.
export function guideOrder(lags, fromManifest) {
  const idx = lags.map((_, i) => i);
  return fromManifest ? idx : idx.sort((a, b) => lags[a] - lags[b] || a - b);
}

export function createGuide(order) { return { order: [...order], step: 0 }; }

// Pieza que toca encajar ahora (-1 si ya se armo todo).
export function guideExpected(g) { return g && g.step < g.order.length ? g.order[g.step] : -1; }

// Sin armado guiado cualquier pieza encaja; con armado guiado, solo la que toca.
export function guideCanSnap(g, i) { return !g || guideExpected(g) === i; }

// Registra que encajo la pieza i. Devuelve true si con eso se termino el armado.
export function guideAdvance(g, i) {
  if (g && guideExpected(g) === i) g.step++;
  return !!g && g.step >= g.order.length;
}

// Iman al soltar una pieza: encaja si su centro en pantalla queda a menos de
// PIECES.SNAP_FRAC del ancho del cuadro del modelo de su lugar original.
export function shouldSnap(distPx, frameW) {
  return distPx <= PIECES.SNAP_FRAC * frameW;
}

// Punto de pantalla -> coordenadas normalizadas (-1..1, y hacia arriba) dentro
// del rectangulo de un canvas. null si el punto cae fuera.
export function screenToNdc(rect, x, y) {
  if (x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return null;
  return {
    x: ((x - rect.left) / rect.width) * 2 - 1,
    y: -(((y - rect.top) / rect.height) * 2 - 1),
  };
}

// Igual, pero un punto fuera del cuadro se lleva al borde (con margen `edge` en
// -1..1): una pieza arrastrada no se sale del canvas del modelo (no se veria).
export function screenToNdcClamped(rect, x, y, edge) {
  const cx = Math.max(rect.left, Math.min(rect.left + rect.width, x));
  const cy = Math.max(rect.top, Math.min(rect.top + rect.height, y));
  const n = screenToNdc(rect, cx, cy);
  const lim = 1 - edge;
  return { x: Math.max(-lim, Math.min(lim, n.x)), y: Math.max(-lim, Math.min(lim, n.y)) };
}
