export const store = {
  items: [],
  hands: [],
  landmarker: null,
  cfg: { name: "HeyTECHI", orbs: [] },
  ring: { state: "idle", mood: "green", wave: [] },
  showHud: false,
  activeId: null,
};

let uid = 1;
export function nextId() { return "i" + (uid++); }
