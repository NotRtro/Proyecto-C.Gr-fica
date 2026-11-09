import { PIECES } from "../core/config.js";

function meshesBelow(n) {
  let c = n.mesh ? 1 : 0;
  for (const k of n.children) c += meshesBelow(k);
  return c;
}

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

export function prettyName(raw) {
  if (!raw) return null;
  const s = String(raw)
    .replace(/\.\d+$/, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || /^(node|mesh|object|group|empty)?\s*\d*$/i.test(s)) return null;
  return s;
}

export function manifestPathFor(src) {
  if (/(^|\/)model\.(glb|gltf)$/i.test(src)) return src.replace(/model\.(glb|gltf)$/i, "manifest.json");
  return src.replace(/\.(glb|gltf)$/i, ".json");
}

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

export function guideOrder(lags, fromManifest) {
  const idx = lags.map((_, i) => i);
  return fromManifest ? idx : idx.sort((a, b) => lags[a] - lags[b] || a - b);
}

export function createGuide(order) { return { order: [...order], step: 0 }; }

export function guideExpected(g) { return g && g.step < g.order.length ? g.order[g.step] : -1; }

export function guideCanSnap(g, i) { return !g || guideExpected(g) === i; }

export function guideAdvance(g, i) {
  if (g && guideExpected(g) === i) g.step++;
  return !!g && g.step >= g.order.length;
}

export function shouldSnap(distPx, frameW) {
  return distPx <= PIECES.SNAP_FRAC * frameW;
}

export function screenToNdc(rect, x, y) {
  if (x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return null;
  return {
    x: ((x - rect.left) / rect.width) * 2 - 1,
    y: -(((y - rect.top) / rect.height) * 2 - 1),
  };
}

export function screenToNdcClamped(rect, x, y, edge) {
  const cx = Math.max(rect.left, Math.min(rect.left + rect.width, x));
  const cy = Math.max(rect.top, Math.min(rect.top + rect.height, y));
  const n = screenToNdc(rect, cx, cy);
  const lim = 1 - edge;
  return { x: Math.max(-lim, Math.min(lim, n.x)), y: Math.max(-lim, Math.min(lim, n.y)) };
}
