const COLORS = {
  artery: 0xc84d4d,
  vein: 0x4674c8,
  nerve: 0xd5aa32,
  muscle: 0xc86f58,
  ligament: 0x329b8d,
  cartilage: 0x4c91b8,
  lymphatic: 0x67a85b,
  gland: 0xa865b5,
};

const FALLBACK_COLORS = [0x3f8fbd, 0xc56f4d, 0x58a476, 0x9a68bd, 0xc29b38, 0x368f88];

const TYPES = [
  ["artery", ["artery", "arterial"]],
  ["vein", ["vein", "venous", "vena cava"]],
  ["nerve", ["nerve", "nervous", "ganglion", "plexus"]],
  ["muscle", ["muscle", "musculus"]],
  ["ligament", ["ligament", "tendon", "retinaculum", "aponeurosis"]],
  ["cartilage", ["cartilage", "meniscus", "articular disc"]],
  ["lymphatic", ["lymph", "node", "nodes"]],
  ["gland", ["gland", "thyroid", "pituitary", "adrenal"]],
];

function hashColor(name) {
  let hash = 0;
  for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function anatomyColorFor(name) {
  const normalized = String(name || "").toLowerCase();
  const match = TYPES.find(([, words]) => words.some((word) => normalized.includes(word)));
  return match ? COLORS[match[0]] : hashColor(normalized);
}

export function needsAnatomyColor({ color, textured = false, vertexColors = false, declared = true }) {
  if (textured || vertexColors) return false;
  if (!declared) return true;
  const [r = 1, g = 1, b = 1] = color || [];
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const chroma = high - low;
  return (luminance > 0.56 && low > 0.45) || (chroma < 0.08 && luminance > 0.4);
}

export function needsEmissiveNormalization({ emissive, emissiveMap = false }) {
  if (emissiveMap) return false;
  const [r = 0, g = 0, b = 0] = emissive || [];
  return Math.min(r, g, b) > 0.85;
}
