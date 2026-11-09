import { MODEL_LOOK } from "../core/config.js";

export function hasOwnLook(materials) {
  if (!materials.length) return false;
  if (materials.some((m) => m.textured)) return true;
  if (materials.some((m) => Math.max(...m.color) - Math.min(...m.color) > MODEL_LOOK.SATURATION)) return true;
  const q = (v) => Math.round(v / MODEL_LOOK.COLOR_STEP);
  const distinct = new Set(materials.map((m) => m.color.map(q).join(",")));
  return distinct.size >= 2;
}
