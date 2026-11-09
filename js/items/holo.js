import * as THREE from "three";
import { registerItemType } from "./registry.js";
import { MODEL_PX, HOLO, FOLLOW_LERP } from "../core/config.js";
import { settings } from "../core/settings.js";
import { buildReactorGeometry } from "../three/reactorGeometry.js";
import { buildHoloMaterial } from "../three/holoMaterial.js";

function setUniforms(view, t, explode, dissolve, wire) {
  view.mat.uniforms.u_time.value = t;
  view.mat.uniforms.u_explode.value = explode;
  view.mat.uniforms.u_dissolve.value = dissolve;
  view.mat.uniforms.u_wire.value = wire ? 1 : 0;
}

registerItemType("holo", {
  defaultPos: { x: 0.5, y: 0.45 },
  defaultTitle: "Reactor",
  rotatable: true,
  explodable: true,
  build() {
    const el = document.createElement("div");
    el.className = "modelcard";
    const canvas = document.createElement("canvas");
    el.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(MODEL_PX, MODEL_PX, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 8);
    const group = new THREE.Group();
    const geo = buildReactorGeometry();
    const mat = buildHoloMaterial();
    group.add(new THREE.Mesh(geo, mat));
    scene.add(group);
    return { el, canvas, renderer, scene, camera, group, geo, mat };
  },
  init(item) {
    item.explode = 0; item.explodeTarget = 0;
    item.dissolve = 0; item.dissolveTarget = 0;
  },
  update(item, dt, now) {
    if (settings.autoSpin && !item.manipulated && !item.spinPaused) item.ry += HOLO.SPIN * dt;
    item.view.group.rotation.y = item.ry;
    item.explode += (item.explodeTarget - item.explode) * (1 - Math.exp(-HOLO.EXPLODE_RATE * dt));
    item.dissolve += (item.dissolveTarget - item.dissolve) * (1 - Math.exp(-HOLO.DISSOLVE_RATE * dt));
    setUniforms(item.view, now / 1000, item.explode, item.dissolve, settings.wire);
    item.view.renderer.render(item.view.scene, item.view.camera);
  },
  sync(ri, def, env) {
    ri.ry += ((def.ry || 0) - ri.ry) * FOLLOW_LERP;
    ri.explode += ((def.explode || 0) - ri.explode) * FOLLOW_LERP;
    ri.dissolve += ((def.dissolve || 0) - ri.dissolve) * FOLLOW_LERP;
    ri.view.group.rotation.y = ri.ry;
    ri.view.scene.scale.x = env.mirror ? -1 : 1;
    setUniforms(ri.view, env.now / 1000, ri.explode, ri.dissolve, env.view.wire !== false);
    ri.view.renderer.render(ri.view.scene, ri.view.camera);
  },
  dispose(item) {
    item.view.geo.dispose();
    item.view.mat.dispose();
    item.view.renderer.dispose();
  },
});
