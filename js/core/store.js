// Estado unico de la escena. Los modulos mutan este objeto; nunca se reasigna
// `store.items` (se usa splice) para que todos vean siempre el mismo arreglo.
export const store = {
  items: [],
  hands: [],        // estados de mano del ultimo frame (js/input/gestures.js + mouse)
  landmarker: null,
  cfg: { name: "HeyTECHI", orbs: [] },
  ring: { state: "idle", mood: "green", wave: [] },
  showHud: false,
  activeId: null,   // ultimo item "explotable" tocado o agregado: Herramientas y explode actuan sobre el
};

let uid = 1;
export function nextId() { return "i" + (uid++); }
