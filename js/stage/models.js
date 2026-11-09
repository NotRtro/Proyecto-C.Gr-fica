import { store } from "../core/store.js";
import { MODEL } from "../core/config.js";
import { spawnItem, applyTransform } from "../items/registry.js";
import { findModel } from "../net/catalog.js";
import { toast } from "../ui/feedback.js";

export function addModel(src, { title, x, y } = {}) {
  const existing = store.items.find((it) => it.type === "model" && it.src === src);
  if (existing) {
    existing.x = innerWidth / 2; existing.y = innerHeight * 0.45; existing.scale = 1;
    applyTransform(existing);
    store.activeId = existing.id;
    toast((existing.title || "El modelo") + " ya estaba en escena: lo traje al centro");
    return existing;
  }
  const count = store.items.filter((it) => it.type === "model").length;
  if (count >= MODEL.MAX_IN_SCENE) {
    toast("Máximo " + MODEL.MAX_IN_SCENE + " modelos a la vez: quita uno en Menú › Modelos", { kind: "error" });
    return null;
  }
  const entry = findModel(src);
  const pos = x === undefined || y === undefined ? freeSpot() : { x, y };
  const fileName = src.split("/").pop().replace(/\.(glb|gltf)$/i, "");
  return spawnItem("model", { src, title: title || (entry ? entry.name : fileName), ...pos });
}

const SPOTS = [[0.5, 0.45], [0.72, 0.5], [0.28, 0.5], [0.5, 0.62]];
function freeSpot() {
  const taken = store.items.filter((it) => it.type === "model" || it.type === "holo")
    .map((it) => [it.x / innerWidth, it.y / innerHeight]);
  const free = SPOTS.find(([sx, sy]) => taken.every(([tx, ty]) => Math.hypot(tx - sx, ty - sy) > 0.15));
  const [x, y] = free || SPOTS[0];
  return { x, y };
}
