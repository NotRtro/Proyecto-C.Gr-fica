// Estado unico de la escena. Los modulos mutan este objeto; nunca se reasigna
// `store.items` (se usa splice) para que todos vean siempre el mismo arreglo.
export const store = {
  items: [],
  cursors: {},
  landmarker: null,
  cfg: { name: "Assistant", orbs: [] },
  ring: { state: "idle", mood: "green", wave: [] },
  showHud: false,
};

let uid = 1;
export function nextId() { return "i" + (uid++); }
