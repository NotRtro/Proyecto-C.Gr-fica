let models = [];
let loaded = false;

export function catalog() { return models; }
export function catalogLoaded() { return loaded; }

export async function refreshCatalog() {
  try {
    const data = await fetch("/models", { cache: "no-store" }).then((r) => r.json());
    models = Array.isArray(data.models) ? data.models : [];
  } catch (e) { }
  loaded = true;
  return models;
}

export function findModel(src) { return models.find((m) => m.src === src || m.id === src) || null; }
