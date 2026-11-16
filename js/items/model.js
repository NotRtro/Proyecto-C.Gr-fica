import * as THREE from "three";
import { registerItemType } from "./registry.js";
import { HOLO, FOLLOW_LERP, MODEL, PIECES } from "../core/config.js";
import { settings } from "../core/settings.js";
import { emit } from "../core/bus.js";
import { buildHoloModelMaterial } from "../three/holoModelMaterial.js";
import { hasOwnLook } from "../three/modelLook.js";
import { anatomyColorFor, needsAnatomyColor, needsEmissiveNormalization } from "../three/anatomyColor.js";
import { manifestPathFor, guideOrder, createGuide, guideExpected, guideCanSnap, guideAdvance } from "../three/pieces.js";
import {
  buildPieces, applyPieces, relaxPieces, placedCount, pickPiece, setHighlight, isDragged,
  beginDrag, moveDrag, endDrag, cancelDrags, serializePieces, applyRemotePieces, setHint, resetPieces,
  unplacePiece, snapPiece,
} from "../three/pieceRig.js";

const DRACO_PATH = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/";

let loaderPromise = null;
function gltfLoader() {
  if (!loaderPromise) {
    loaderPromise = Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/DRACOLoader.js"),
      import("three/addons/libs/meshopt_decoder.module.js"),
    ]).then(([g, d, m]) => {
      const loader = new g.GLTFLoader();
      const draco = new d.DRACOLoader();
      draco.setDecoderPath(DRACO_PATH);
      loader.setDRACOLoader(draco);
      loader.setMeshoptDecoder(m.MeshoptDecoder);
      return loader;
    });
  }
  return loaderPromise;
}

let roomEnvPromise = null;
function roomEnvironment() {
  if (!roomEnvPromise) {
    roomEnvPromise = import("three/addons/environments/RoomEnvironment.js").then((m) => m.RoomEnvironment);
  }
  return roomEnvPromise;
}

async function loadManifest(src) {
  try {
    const res = await fetch("/media/" + manifestPathFor(src), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === "object" ? data : null;
  } catch (e) {
    return null;
  }
}

async function loadInto(view, src) {
  const [loader, manifest] = await Promise.all([gltfLoader(), loadManifest(src)]);
  const gltf = await loader.loadAsync("/media/" + src);
  if (view.disposed) { disposeObject(gltf.scene); return; }
  const obj = gltf.scene;
  prepareOriginalMaterials(obj, gltf.parser);

  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const diag = size.length() || 1;
  obj.position.sub(center);
  obj.updateMatrixWorld(true);

  const { skinned } = buildPieces(view, obj, gltf.parser, diag, manifest);
  view.manifest = manifest;

  const k = MODEL.FIT / diag;
  view.group.scale.setScalar(k);
  view.group.add(obj);
  view.obj = obj;
  view.holoMat.uniforms.uMinY.value = -size.y * k * 0.5;
  view.holoMat.uniforms.uSpan.value = size.y * k;

  obj.traverse((n) => { if (n.isMesh) view.originals.set(n, n.material); });
  view.hasLook = hasOwnLook([...view.originals.values()].flat().map(describeMaterial));
  view.ready = true;
  view.status.remove();
  view.stats = { parts: view.parts.length, triangles: countTriangles(obj), skinned, manifest: !!manifest };
}

function countTriangles(obj) {
  let t = 0;
  obj.traverse((n) => {
    if (!n.isMesh) return;
    const g = n.geometry;
    t += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(t);
}

function describeMaterial(m) {
  const textured = ["map", "emissiveMap", "normalMap", "aoMap"].some((k) => !!m[k]);
  return { textured, color: m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1] };
}

function declaredMaterial(node, parser) {
  const association = parser.associations?.get(node);
  const mesh = association?.meshes;
  const primitive = association?.primitives;
  return Number.isInteger(mesh) && Number.isInteger(primitive)
    && Number.isInteger(parser.json.meshes?.[mesh]?.primitives?.[primitive]?.material);
}

function materialNeedsColor(material, node, declared) {
  return needsAnatomyColor({
    color: material.color ? [material.color.r, material.color.g, material.color.b] : [1, 1, 1],
    textured: !!material.map,
    vertexColors: !!node.geometry?.attributes?.color,
    declared,
  });
}

function preparedMaterial(material, node, recolor) {
  const prepared = material.clone();
  if (prepared.emissive && needsEmissiveNormalization({
    emissive: [prepared.emissive.r, prepared.emissive.g, prepared.emissive.b],
    emissiveMap: !!prepared.emissiveMap,
  })) prepared.emissive.setRGB(0, 0, 0);
  if (recolor && prepared.color) {
    prepared.color.setHex(anatomyColorFor(node.name));
    prepared.roughness = 0.72;
    prepared.metalness = 0;
  }
  return prepared;
}

function prepareOriginalMaterials(obj, parser) {
  const declaredCache = new Map();
  obj.traverse((node) => {
    if (!node.isMesh) return;
    const declared = declaredMaterial(node, parser);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const prepared = materials.map((material) => {
      const recolor = materialNeedsColor(material, node, declared);
      if (recolor) return preparedMaterial(material, node, true);
      if (!declaredCache.has(material)) declaredCache.set(material, preparedMaterial(material, node, false));
      return declaredCache.get(material);
    });
    node.material = Array.isArray(node.material) ? prepared : prepared[0];
  });
}

const explodeFrac = (item) => Math.min(1, item.explode / HOLO.EXPLODE_OUT);

function pickModel(item, x, y) {
  const v = item.view;
  if (!v.ready) return v.error ? null : { part: -1 };
  const key = v.drawn + "|" + Math.round(x) + "|" + Math.round(y);
  if (v.pickKey === key) return v.pickHit;
  const i = pickPiece(v, x, y);
  v.pickKey = key;
  v.pickHit = i === null ? null : { part: i };
  return v.pickHit;
}

export function piecesActive(item) {
  return item.type === "model" && item.view.ready && item.view.parts.length >= 2
    && explodeFrac(item) >= PIECES.PICK_MIN_EXPLODE;
}

export function pieceLabel(item, i, withIds = false) {
  const p = item.view.parts[i];
  if (!p) return "";
  return withIds ? p.label + " · #" + p.ids.join(",") : p.label;
}

function pieceMetadata(item, index, key) {
  const piece = item?.view?.parts[index];
  return Array.isArray(piece?.[key]) ? piece[key] : [];
}

export function pieceAnatomyIds(item, i) {
  return pieceMetadata(item, i, "anatomyIds");
}

export function pieceSourceNames(item, i) {
  return pieceMetadata(item, i, "sourceNames");
}

function pieceFree(item, i) { return piecesActive(item) && i >= 0 && !isDragged(item.view, i); }

function pieceBegin(item, i, hand, x, y) {
  return beginDrag(item.view, i, hand, x, y, explodeFrac(item));
}

function pieceMove(item, hand, x, y) { moveDrag(item.view, hand, x, y); }

function pieceEnd(item, hand) {
  const v = item.view;
  const res = endDrag(v, hand, (i) => guideCanSnap(item.guide, i));
  if (!res) return null;
  const out = { part: res.i, label: v.parts[res.i].label, snapped: res.snapped,
    placed: placedCount(v), total: v.parts.length };
  if (res.snapped) afterSnap(item, res.i);
  else if (item.guide && res.near) { out.wrong = true; out.expected = pieceLabel(item, guideExpected(item.guide)); }
  return out;
}

function afterSnap(item, i) {
  const v = item.view;
  if (item.guide) guideAdvance(item.guide, i);
  if (placedCount(v) === v.parts.length) {
    if (item.guide) stopGuide(item, true);
    item.explodeTarget = 0;
    emit("model:assembled", { item });
  } else if (item.guide) emitGuide(item);
}

export function placePiece(item, i) {
  const v = item.view;
  if (item.type !== "model" || !v.ready || !piecesActive(item)) return null;
  const idx = i === "next" ? guideExpected(item.guide) : Number(i);
  if (!Number.isInteger(idx) || idx < 0 || !guideCanSnap(item.guide, idx) || !snapPiece(v, idx)) return null;
  const out = { item, part: idx, label: v.parts[idx].label, snapped: true, placed: placedCount(v), total: v.parts.length };
  emit("piece:drop", { hand: null, ...out });
  afterSnap(item, idx);
  return out;
}

export function undoLastPiece(item) {
  const v = item.view;
  if (item.type !== "model" || !v.ready || !v.placedOrder.length) return null;
  const i = v.placedOrder.pop();
  unplacePiece(v, i, explodeFrac(item));
  if (item.guide && item.guide.step > 0 && item.guide.order[item.guide.step - 1] === i) {
    item.guide.step--;
    emitGuide(item);
  }
  return v.parts[i].label;
}

export function resetModelPieces(item) {
  const v = item.view;
  if (item.type !== "model" || !v.ready || v.parts.length < 2) return false;
  if (item.guide) return startGuide(item);
  resetPieces(v, explodeFrac(item));
  item.explodeTarget = HOLO.EXPLODE_OUT;
  return true;
}

function emitGuide(item) {
  const g = item.guide;
  emit("guide:update", { item, step: g.step + 1, total: g.order.length, label: pieceLabel(item, guideExpected(g)) });
}

export function startGuide(item) {
  const v = item.view;
  if (item.type !== "model" || !v.ready || v.parts.length < 2) return false;
  resetPieces(v, explodeFrac(item));
  const fromManifest = !!(v.manifest && Array.isArray(v.manifest.pieces) && v.manifest.pieces.length);
  item.guide = createGuide(guideOrder(v.parts.map((p) => p.lag), fromManifest));
  item.explodeTarget = HOLO.EXPLODE_OUT;
  emitGuide(item);
  return true;
}

export function stopGuide(item, done = false) {
  if (!item.guide) return;
  item.guide = null;
  setHint(item.view, -1);
  emit("guide:end", { item, done });
}

function modeFor(view, look) {
  return look === "holo" || !view.hasLook ? "holo" : "solid";
}

async function applyMode(view, mode) {
  if (!view.ready || view.mode === mode) return;
  view.mode = mode;
  const holo = mode !== "solid";
  view.obj.traverse((n) => { if (n.isMesh && !n.userData.overlay) n.material = holo ? view.holoMat : view.originals.get(n); });
  view.renderer.toneMapping = holo ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  view.renderer.toneMappingExposure = 0.82;
  view.lights.visible = !holo;
  if (!holo && !view.envTexture) {
    const RoomEnvironment = await roomEnvironment();
    if (view.disposed) return;
    const pmrem = new THREE.PMREMGenerator(view.renderer);
    view.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    view.scene.environment = view.envTexture;
  }
  view.scene.environment = holo ? null : view.envTexture || null;
}

function ensureResolution(view, scale, held) {
  if (held) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const want = Math.min(Math.max(1, scale), MODEL.RES_MAX / (MODEL.PX * dpr));
  if (Math.abs(want - view.resScale) / view.resScale < MODEL.RES_HYSTERESIS) return;
  view.resScale = want;
  view.renderer.setPixelRatio(dpr * want);
  view.renderer.setSize(MODEL.PX, MODEL.PX, false);
}

function draw(view, ry, explode, dt) {
  view.group.rotation.y = ry;
  if (view.ready) {
    const f = Math.min(1, explode / HOLO.EXPLODE_OUT);
    applyPieces(view, f, dt);
    view.camera.position.z = MODEL.CAM_DIST * (1 + MODEL.EXPLODE_ZOOM * f);
    view.holoMat.uniforms.uTime.value = Date.now() / 1000;
  }
  view.renderer.render(view.scene, view.camera);
  view.drawn++;
}

function disposeObject(obj) {
  obj.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    const mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    for (const m of mats) { for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"]) if (m[key]) m[key].dispose(); m.dispose(); }
  });
}

const overlayMaterial = (color, opacity, additive) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false,
  blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
});

registerItemType("model", {
  defaultPos: { x: 0.5, y: 0.45 },
  rotatable: true,
  explodable: true,
  pick: pickModel,
  pieceFree, pieceBegin, pieceMove, pieceEnd,
  build(def) {
    const el = document.createElement("div");
    el.className = "modelcard glb";
    const canvas = document.createElement("canvas");
    const status = document.createElement("div");
    status.className = "model-status";
    status.textContent = "Cargando " + (def.title || def.src || "modelo") + "…";
    el.append(canvas, status);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(MODEL.PX, MODEL.PX, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 0, MODEL.CAM_DIST);
    const group = new THREE.Group();
    scene.add(group);
    const lights = new THREE.Group();
    lights.add(new THREE.AmbientLight(0xffffff, 0.28));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 3, 4);
    lights.add(key);
    lights.visible = false;
    scene.add(lights);

    const view = {
      el, canvas, status, renderer, scene, camera, group, lights,
      holoMat: buildHoloModelMaterial(), originals: new Map(), parts: [], meshPiece: new Map(), drags: new Map(),
      hlMat: overlayMaterial(PIECES.HIGHLIGHT, PIECES.HIGHLIGHT_ALPHA, true), hlMeshes: [], hl: -1,
      ghostMat: overlayMaterial(PIECES.GHOST, PIECES.GHOST_ALPHA, false),
      hintMat: overlayMaterial(PIECES.HINT, PIECES.HINT_ALPHA, true), hintMeshes: [], hint: -1,
      ready: false, disposed: false, mode: null, resScale: 1, src: def.src, drawn: 0,
    };
    view.loading = loadInto(view, def.src).catch((e) => {
      console.error("[modelo] no se pudo cargar", def.src, e);
      status.textContent = "No se pudo cargar " + (def.src || "el modelo");
      status.classList.add("error");
      view.error = e;
    });
    return view;
  },
  init(item, def) {
    item.src = def.src || "";
    item.ry = MODEL.START_RY;
    item.explode = 0; item.explodeTarget = 0;
    item.hoverPart = -1;
    item.view.loading.then(() => {
      if (item.view.ready) emit("model:loaded", { item, stats: item.view.stats });
      else if (item.view.error) emit("model:error", { item, error: item.view.error });
    });
  },
  update(item, dt) {
    const v = item.view;
    if (settings.autoSpin && !item.manipulated && !item.spinPaused && !v.drags.size) item.ry += HOLO.SPIN * 0.5 * dt;
    item.explode += (item.explodeTarget - item.explode) * (1 - Math.exp(-HOLO.EXPLODE_RATE * dt));
    if (v.ready && item.explodeTarget / HOLO.EXPLODE_OUT < PIECES.PICK_MIN_EXPLODE) {
      cancelDrags(v);
      relaxPieces(v, dt, item.explode < 0.01);
      stopGuide(item);
    }
    if (v.ready) setHint(v, item.guide ? guideExpected(item.guide) : -1);
    applyMode(v, modeFor(v, settings.modelLook));
    ensureResolution(v, item.scale, item.grabbed);
    const dragged = v.drags.size ? v.drags.values().next().value.i : -1;
    setHighlight(v, dragged >= 0 ? dragged : piecesActive(item) ? item.hoverPart : -1);
    draw(v, item.ry, item.explode, dt);
  },
  serialize(item) {
    return item.view.ready ? { pieces: serializePieces(item.view) } : {};
  },
  sync(ri, def, env) {
    ri.view.scene.scale.x = env.mirror ? -1 : 1;
    ri.ry += ((def.ry || 0) - ri.ry) * FOLLOW_LERP;
    ri.explode += ((def.explode || 0) - ri.explode) * FOLLOW_LERP;
    if (ri.view.ready) applyRemotePieces(ri.view, def.pieces, FOLLOW_LERP);
    applyMode(ri.view, modeFor(ri.view, env.view.modelLook || "original"));
    ensureResolution(ri.view, ri.scale, false);
    const now = env.now / 1000;
    const dt = ri.lastT ? Math.min(0.1, now - ri.lastT) : 0;
    ri.lastT = now;
    draw(ri.view, ri.ry, ri.explode, dt);
  },
  dispose(item) {
    const v = item.view;
    v.disposed = true;
    if (v.ready) cancelDrags(v);
    setHighlight(v, -1);
    if (v.ready) setHint(v, -1);
    v.hlMat.dispose();
    v.hintMat.dispose();
    v.ghostMat.dispose();
    if (v.obj) {
      v.obj.traverse((n) => { if (n.isMesh) n.material = v.originals.get(n) || n.material; });
      disposeObject(v.obj);
    }
    v.holoMat.dispose();
    if (v.envTexture) v.envTexture.dispose();
    v.renderer.dispose();
  },
});
