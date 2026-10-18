// Piezas de un modelo GLB en three.js (fase 7): construirlas, ubicarlas,
// apuntarlas, arrastrarlas y encajarlas. La logica que decide (que es una pieza,
// agrupado por manifest, iman) es pura y vive en js/three/pieces.js.
//
// ESPACIO DEL MODELO: el del grupo `view.group` (modelo ya centrado, antes de su
// escala y giro). Ahi se guardan el centro de cada pieza, su desplazamiento de
// desarmado (off) y el que le da el usuario al arrastrarla (user). Cada nodo lo
// pasa a su espacio local con la parte 3x3 de la inversa de la matriz de su padre.
//
// Posicion de una pieza = su lugar original + desplazamiento, donde el
// desplazamiento es:
//   encajada (placed)  0 (con una animacion corta desde donde se solto)
//   suelta             off x avance del desarmado + user
import * as THREE from "three";
import { PIECES } from "../core/config.js";
import { explodePlan, partFactor } from "./explodePlan.js";
import { findPieces, prettyName, groupPieces, screenToNdc, screenToNdcClamped, shouldSnap } from "./pieces.js";

// Arbol de nodos del glTF para findPieces. GLTFLoader registra en
// parser.associations que objeto vino de que nodo/malla; las primitivas de una
// malla con varios materiales son hijos del objeto del nodo pero NO son nodos.
// Sin associations (otro cargador) cada objeto cuenta como nodo.
function nodeTree(root, parser) {
  const assoc = parser && parser.associations;
  const info = (o) => (assoc ? assoc.get(o) : null);
  const isNode = (o) => (assoc ? !!info(o) && info(o).nodes !== undefined : true);
  const hasMesh = (o) => (assoc ? !!info(o) && info(o).meshes !== undefined : !!o.isMesh);
  const nameOf = (o) => {
    const a = info(o);
    const def = a && a.nodes !== undefined && parser.json.nodes ? parser.json.nodes[a.nodes] : null;
    return def && def.name ? def.name : o.name; // el nombre crudo (GLTFLoader lo "sanea")
  };
  function build(o) {
    const children = [];
    const collect = (p) => {
      for (const c of p.children) {
        if (isNode(c)) children.push(build(c));
        else if (!c.isMesh) collect(c);
      }
    };
    collect(o);
    return { obj: o, name: nameOf(o), mesh: o !== root && hasMesh(o), children };
  }
  return build(root);
}

const inv3Of = (m4) => new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(m4).invert());

// obj: escena del glTF ya centrada (sus matrices de mundo = espacio del modelo).
// Llena view.parts y view.meshPiece (malla -> indice de pieza).
export function buildPieces(view, obj, parser, diag, manifest) {
  let skinned = false;
  obj.traverse((n) => { if (n.isSkinnedMesh) skinned = true; });
  const auto = skinned ? [] : findPieces(nodeTree(obj, parser)); // los personajes no se desarman
  const groups = groupPieces(auto.length, manifest);
  const boxes = groups.map((g) => {
    const b = new THREE.Box3();
    for (const i of g.members) b.expandByObject(auto[i].obj);
    return b;
  });
  const plan = explodePlan(boxes.map((b) => ({
    center: b.getCenter(new THREE.Vector3()).toArray(), size: b.getSize(new THREE.Vector3()).length(),
  })), diag);
  view.meshPiece = new Map();
  view.parts = groups.map((g, i) => {
    const nodes = g.members.map((j) => {
      const node = auto[j].obj;
      return { node, home: node.position.clone(), inv3: inv3Of(node.parent.matrixWorld) };
    });
    const meshes = [];
    for (const n of nodes) n.node.traverse((m) => { if (m.isMesh) { meshes.push(m); view.meshPiece.set(m, i); } });
    const single = g.members.length === 1 ? prettyName(auto[g.members[0]].name) : null;
    return {
      nodes, meshes, ids: g.members.map((j) => j + 1),
      label: g.label || single || "Pieza " + (g.members[0] + 1),
      center: boxes[i].getCenter(new THREE.Vector3()),
      off: new THREE.Vector3(...plan[i].offset), lag: plan[i].lag,
      user: new THREE.Vector3(), disp: new THREE.Vector3(),
      placed: false, snap: null,
    };
  });
  view.drags = new Map();
  return { skinned };
}

// ---- ubicar ----------------------------------------------------------------

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

// f: avance del desarmado (0 armado .. 1 desarmado). dt en segundos.
export function applyPieces(view, f, dt) {
  for (const p of view.parts) {
    if (p.snap) {
      p.snap.t = Math.min(1, p.snap.t + (dt * 1000) / PIECES.SNAP_MS);
      const e = 1 - (1 - p.snap.t) ** 3; // ease-out
      p.disp.copy(p.snap.from).multiplyScalar(1 - e);
      if (p.snap.t >= 1) p.snap = null;
    } else if (p.placed) {
      p.disp.set(0, 0, 0);
    } else {
      p.disp.copy(p.off).multiplyScalar(partFactor(f, p.lag)).add(p.user);
    }
    for (const n of p.nodes) n.node.position.copy(n.home).add(tmp.copy(p.disp).applyMatrix3(n.inv3));
  }
}

// Al armar (gesto, Herramientas o comando) las piezas sacadas vuelven solas y,
// ya armado, se olvida que piezas estaban encajadas.
export function relaxPieces(view, dt, assembled) {
  const k = Math.exp(-PIECES.RELAX_RATE * dt);
  for (const p of view.parts) {
    p.user.multiplyScalar(k);
    if (assembled) { p.user.set(0, 0, 0); p.placed = false; p.snap = null; }
  }
}

export function placedCount(view) { return view.parts.filter((p) => p.placed).length; }

// ---- apuntar (raycast) -----------------------------------------------------

const raycaster = new THREE.Raycaster();

// Indice de la pieza bajo (x, y) de pantalla; -1 si toca una malla que no es
// pieza; null si no toca el modelo.
export function pickPiece(view, x, y) {
  const ndc = screenToNdc(view.canvas.getBoundingClientRect(), x, y);
  if (!ndc) return null;
  view.scene.updateMatrixWorld();
  raycaster.setFromCamera(ndc, view.camera);
  for (const h of raycaster.intersectObject(view.obj, true)) {
    if (h.object.userData.overlay) continue;
    const i = view.meshPiece.get(h.object);
    return i === undefined ? -1 : i;
  }
  return null;
}

// ---- copias superpuestas: resaltado y silueta fantasma ----------------------

function overlayMesh(geometry, material) {
  const o = new THREE.Mesh(geometry, material);
  o.userData.overlay = true; // no es parte del modelo: ni raycast ni cambio de material
  o.raycast = () => {};
  return o;
}

// Resaltado: una copia translucida de cada malla de la pieza, hija de la malla
// (sigue sus movimientos).
export function setHighlight(view, index) {
  if (view.hl === index) return;
  for (const o of view.hlMeshes) o.removeFromParent();
  view.hlMeshes = [];
  view.hl = index;
  const p = view.parts[index];
  if (!p) return;
  for (const m of p.meshes) {
    const o = overlayMesh(m.geometry, view.hlMat);
    o.renderOrder = 10;
    m.add(o);
    view.hlMeshes.push(o);
  }
}

// Silueta en el lugar original de la pieza: copias fijas, hijas del padre de
// cada nodo, con la matriz que tendria la malla con el nodo en su lugar.
function addGhost(view, p) {
  const ghost = [];
  view.scene.updateMatrixWorld();
  for (const n of p.nodes) {
    const homeLocal = new THREE.Matrix4().compose(n.home, n.node.quaternion, n.node.scale);
    const nodeInv = new THREE.Matrix4().copy(n.node.matrixWorld).invert();
    n.node.traverse((m) => {
      if (!m.isMesh || m.userData.overlay) return;
      const g = overlayMesh(m.geometry, view.ghostMat);
      g.matrixAutoUpdate = false;
      g.matrix.copy(homeLocal).multiply(new THREE.Matrix4().multiplyMatrices(nodeInv, m.matrixWorld));
      g.renderOrder = 5;
      n.node.parent.add(g);
      ghost.push(g);
    });
  }
  return ghost;
}

// Armado guiado: la pieza que toca brilla (ambar) y su lugar se ve como silueta.
export function setHint(view, index) {
  if (view.hint === index) return;
  for (const o of view.hintMeshes) o.removeFromParent();
  view.hintMeshes = [];
  view.hint = index;
  const p = view.parts[index];
  if (!p) return;
  for (const m of p.meshes) {
    const o = overlayMesh(m.geometry, view.hintMat);
    o.renderOrder = 9;
    m.add(o);
    view.hintMeshes.push(o);
  }
  view.hintMeshes.push(...addGhost(view, p));
}

// Todas las piezas vuelven al desarmado normal (empezar un armado desde cero).
export function resetPieces(view) {
  cancelDrags(view);
  for (const p of view.parts) { p.user.set(0, 0, 0); p.placed = false; p.snap = null; }
}

// ---- arrastrar y encajar ----------------------------------------------------

function hitPlane(view, x, y, plane) {
  const ndc = screenToNdcClamped(view.canvas.getBoundingClientRect(), x, y, PIECES.DRAG_EDGE);
  raycaster.setFromCamera(ndc, view.camera);
  return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
}

function toWorld(view, v) { return v.clone().applyMatrix4(view.group.matrixWorld); }

export function isDragged(view, i) {
  for (const d of view.drags.values()) if (d.i === i) return true;
  return false;
}

// Toma la pieza i con la mano `key` en (x, y). La pieza se mueve en el plano
// paralelo a la pantalla que pasa por su centro (la profundidad no cambia).
// f: avance actual del desarmado.
export function beginDrag(view, i, key, x, y, f) {
  const p = view.parts[i];
  if (!p || isDragged(view, i)) return false;
  view.scene.updateMatrixWorld();
  const c = toWorld(view, tmp2.copy(p.center).add(p.disp));
  const normal = view.camera.getWorldDirection(new THREE.Vector3()).negate();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, c);
  const h0 = hitPlane(view, x, y, plane);
  if (!h0) return false;
  // La pieza sigue donde se ve: su desplazamiento actual pasa a ser del usuario.
  p.user.copy(p.disp).sub(tmp.copy(p.off).multiplyScalar(partFactor(f, p.lag)));
  p.placed = false; p.snap = null;
  // (si la pieza es la pista del armado guiado, su silueta ya esta a la vista)
  view.drags.set(key, { i, plane, h0, user0: p.user.clone(), ghost: view.hint === i ? [] : addGhost(view, p) });
  return true;
}

export function moveDrag(view, key, x, y) {
  const d = view.drags.get(key);
  if (!d) return;
  const h = hitPlane(view, x, y, d.plane);
  if (!h) return;
  const toModel = inv3Of(view.group.matrixWorld);
  view.parts[d.i].user.copy(d.user0).add(h.sub(d.h0).applyMatrix3(toModel));
}

// Suelta la pieza. Si queda cerca (en pantalla) de su lugar original, encaja.
// canSnap(i): permite que el armado guiado solo deje encajar la pieza que toca.
// Devuelve { i, snapped, near } o null (near: estaba cerca de su lugar, haya
// encajado o no).
export function endDrag(view, key, canSnap = () => true) {
  const d = view.drags.get(key);
  if (!d) return null;
  view.drags.delete(key);
  for (const g of d.ghost) g.removeFromParent();
  const p = view.parts[d.i];
  const rect = view.canvas.getBoundingClientRect();
  const toPx = (v) => {
    const s = toWorld(view, v).project(view.camera);
    return { x: (s.x + 1) / 2 * rect.width, y: (1 - s.y) / 2 * rect.height };
  };
  const now = toPx(tmp2.copy(p.center).add(p.disp)), home = toPx(p.center);
  const near = shouldSnap(Math.hypot(now.x - home.x, now.y - home.y), rect.width);
  const snapped = near && canSnap(d.i);
  if (snapped) {
    p.placed = true;
    p.snap = { from: p.disp.clone(), t: 0 };
    p.user.set(0, 0, 0);
  }
  return { i: d.i, snapped, near };
}

export function cancelDrags(view) {
  for (const key of [...view.drags.keys()]) endDrag(view, key, () => false);
}

// ---- OBS: estado de las piezas en /state -------------------------------------

const r3 = (v) => Math.round(v * 1000) / 1000;

// Solo las piezas que se apartan del desarmado normal: [i, ux, uy, uz, encajada].
export function serializePieces(view) {
  const out = [];
  view.parts.forEach((p, i) => {
    if (p.placed || p.user.lengthSq() > 1e-10) out.push([i, r3(p.user.x), r3(p.user.y), r3(p.user.z), p.placed ? 1 : 0]);
  });
  return out;
}

// Render page: aplica lo que publica el tracker (con suavizado).
export function applyRemotePieces(view, list, lerp) {
  const seen = new Set();
  for (const [i, ux, uy, uz, placed] of list || []) {
    const p = view.parts[i];
    if (!p) continue;
    seen.add(i);
    if (placed && !p.placed) { p.snap = { from: p.disp.clone(), t: 0 }; p.user.set(0, 0, 0); }
    p.placed = !!placed;
    if (!placed) p.user.lerp(tmp.set(ux, uy, uz), lerp);
  }
  view.parts.forEach((p, i) => {
    if (seen.has(i)) return;
    p.placed = false;
    p.user.multiplyScalar(1 - lerp);
  });
}
