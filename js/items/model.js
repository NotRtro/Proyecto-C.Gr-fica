// Modelo 3D del catalogo (GLB / glTF de media/models), fase 6.
//
//   - Se carga perezosamente con GLTFLoader; mientras tanto la tarjeta muestra
//     "Cargando <nombre>...".
//   - Se centra y escala para que quepa (docs/04: "Centrado y escalado").
//   - PIEZAS: cada nodo del glTF que tiene malla es una pieza (si un nodo tiene
//     varias primitivas/materiales, se mueven juntas). El explode las separa con
//     js/three/explodePlan.js.
//   - Modo "solid" (materiales originales + luz de entorno, docs/04 "Modo solido")
//     u "holo" (shader holografico, js/three/holoModelMaterial.js). Por defecto se
//     ve original y solo es holografico si no trae apariencia propia; Menu > Vista
//     puede forzar holografico. La render page (OBS) usa lo mismo.
//   - Resolucion adaptativa: al agrandarlo con dos manos se re-dimensiona el canvas
//     (sin tirones: solo cuando no esta agarrado, con histeresis).
//
// Cada modelo tiene su propio renderer WebGL (como el reactor). Limite: MODEL.MAX_IN_SCENE.
import * as THREE from "three";
import { registerItemType } from "./registry.js";
import { HOLO, FOLLOW_LERP, MODEL } from "../core/config.js";
import { settings } from "../core/settings.js";
import { emit } from "../core/bus.js";
import { buildHoloModelMaterial } from "../three/holoModelMaterial.js";
import { explodePlan, partFactor } from "../three/explodePlan.js";
import { hasOwnLook } from "../three/modelLook.js";

let loaderPromise = null;
function gltfLoader() {
  if (!loaderPromise) {
    loaderPromise = import("three/addons/loaders/GLTFLoader.js").then((m) => new m.GLTFLoader());
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

// Piezas del modelo: el objeto de cada nodo glTF que tiene malla. GLTFLoader
// registra en parser.associations que objeto vino de que nodo/malla.
function findParts(obj, parser) {
  const parts = [];
  obj.traverse((n) => {
    const a = parser && parser.associations ? parser.associations.get(n) : null;
    if (a && a.nodes !== undefined && a.meshes !== undefined) parts.push(n);
  });
  if (parts.length) return parts;
  obj.traverse((n) => { if (n.isMesh) parts.push(n); }); // respaldo
  return parts;
}

async function loadInto(view, src) {
  const loader = await gltfLoader();
  const gltf = await loader.loadAsync("/media/" + src);
  if (view.disposed) { disposeObject(gltf.scene); return; }
  const obj = gltf.scene;

  // Centrar en el origen (docs/04).
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const diag = size.length() || 1;
  obj.position.sub(center);
  obj.updateMatrixWorld(true);

  // Plan de explode por pieza: offsets en el espacio del modelo, pasados al
  // espacio local del padre de cada pieza (solo la parte 3x3 de su matriz).
  const partObjs = findParts(obj, gltf.parser);
  const infos = partObjs.map((p) => {
    const b = new THREE.Box3().setFromObject(p);
    return { center: b.getCenter(new THREE.Vector3()).toArray(), size: b.getSize(new THREE.Vector3()).length() };
  });
  const plan = explodePlan(infos, diag);
  view.parts = partObjs.map((p, i) => {
    const inv = new THREE.Matrix4().copy(p.parent.matrixWorld).invert();
    const off = new THREE.Vector3(...plan[i].offset).applyMatrix3(new THREE.Matrix3().setFromMatrix4(inv));
    return { node: p, home: p.position.clone(), off, lag: plan[i].lag };
  });

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
  view.stats = { parts: view.parts.length, triangles: countTriangles(obj) };
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

// Preferencia "original" | "holo" -> modo de ESTE modelo: los que no traen
// apariencia propia siempre se ven holograficos (js/three/modelLook.js).
function modeFor(view, look) {
  return look === "holo" || !view.hasLook ? "holo" : "solid";
}

// "holo" | "solid"
async function applyMode(view, mode) {
  if (!view.ready || view.mode === mode) return;
  view.mode = mode;
  const holo = mode !== "solid";
  view.obj.traverse((n) => { if (n.isMesh) n.material = holo ? view.holoMat : view.originals.get(n); });
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

function applyExplode(view, f) {
  for (const p of view.parts) {
    const t = partFactor(f, p.lag);
    p.node.position.set(p.home.x + p.off.x * t, p.home.y + p.off.y * t, p.home.z + p.off.z * t);
  }
}

// Resolucion adaptativa (docs/04, ensureModelRes): el canvas mide MODEL.PX en CSS y
// el item se escala con CSS; si se agranda, se sube la resolucion del dibujo.
function ensureResolution(view, scale, held) {
  if (held) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const want = Math.min(Math.max(1, scale), MODEL.RES_MAX / (MODEL.PX * dpr));
  if (Math.abs(want - view.resScale) / view.resScale < MODEL.RES_HYSTERESIS) return;
  view.resScale = want;
  view.renderer.setPixelRatio(dpr * want);
  view.renderer.setSize(MODEL.PX, MODEL.PX, false);
}

function draw(view, ry, explode) {
  view.group.rotation.y = ry;
  if (view.ready) {
    const f = Math.min(1, explode / HOLO.EXPLODE_OUT);
    applyExplode(view, f);
    view.camera.position.z = MODEL.CAM_DIST * (1 + MODEL.EXPLODE_ZOOM * f);
    view.holoMat.uniforms.uTime.value = Date.now() / 1000; // reloj: tracker y OBS sincronizados
  }
  view.renderer.render(view.scene, view.camera);
}

function disposeObject(obj) {
  obj.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    const mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    for (const m of mats) { for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"]) if (m[key]) m[key].dispose(); m.dispose(); }
  });
}

registerItemType("model", {
  defaultPos: { x: 0.5, y: 0.45 },
  rotatable: true,
  explodable: true,
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
      holoMat: buildHoloModelMaterial(), originals: new Map(), parts: [],
      ready: false, disposed: false, mode: null, resScale: 1, src: def.src,
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
    item.explode = 0; item.explodeTarget = 0;
    item.view.loading.then(() => {
      if (item.view.ready) emit("model:loaded", { item, stats: item.view.stats });
      else if (item.view.error) emit("model:error", { item, error: item.view.error });
    });
  },
  update(item, dt) {
    if (settings.autoSpin && !item.manipulated) item.ry += HOLO.SPIN * 0.5 * dt;
    item.explode += (item.explodeTarget - item.explode) * (1 - Math.exp(-HOLO.EXPLODE_RATE * dt));
    applyMode(item.view, modeFor(item.view, settings.modelLook));
    ensureResolution(item.view, item.scale, item.grabbed);
    draw(item.view, item.ry, item.explode);
  },
  sync(ri, def, env) {
    ri.ry += ((def.ry || 0) - ri.ry) * FOLLOW_LERP;
    ri.explode += ((def.explode || 0) - ri.explode) * FOLLOW_LERP;
    applyMode(ri.view, modeFor(ri.view, env.view.modelLook || "original"));
    ensureResolution(ri.view, ri.scale, false);
    draw(ri.view, ri.ry, ri.explode);
  },
  dispose(item) {
    const v = item.view;
    v.disposed = true;
    if (v.obj) {
      v.obj.traverse((n) => { if (n.isMesh) n.material = v.originals.get(n) || n.material; });
      disposeObject(v.obj);
    }
    v.holoMat.dispose();
    if (v.envTexture) v.envTexture.dispose();
    v.renderer.dispose();
  },
});
