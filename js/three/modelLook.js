// ¿El modelo trae apariencia propia? Puro (sin three.js), con tests en Node.
//
// Si la trae (texturas o colores propios) se muestra con sus materiales originales;
// si no (sin materiales, o todo de un mismo blanco/gris "de fabrica" como el que
// pone GLTFLoader o Blender por defecto) se muestra holografico.
//
// Cada material se describe como { textured: bool, color: [r, g, b] } (0..1).
import { MODEL_LOOK } from "../core/config.js";

export function hasOwnLook(materials) {
  if (!materials.length) return false;
  if (materials.some((m) => m.textured)) return true;
  // un color con tono (no gris) ya es una apariencia elegida
  if (materials.some((m) => Math.max(...m.color) - Math.min(...m.color) > MODEL_LOOK.SATURATION)) return true;
  // varios grises distintos tambien (piezas pintadas de blanco, gris y negro)
  const q = (v) => Math.round(v / MODEL_LOOK.COLOR_STEP);
  const distinct = new Set(materials.map((m) => m.color.map(q).join(",")));
  return distinct.size >= 2;
}
