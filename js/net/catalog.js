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

const normalizeFolder = (path) => String(path || "").replace(/^\/+|\/+$/g, "");

export function entriesInFolder(list, path = "") {
  const current = normalizeFolder(path);
  const prefix = current ? current + "/" : "";
  const folders = new Set();
  const directModels = [];
  for (const model of list) {
    const folder = normalizeFolder(model.folder);
    if (folder === current) {
      directModels.push(model);
      continue;
    }
    if (!folder.startsWith(prefix)) continue;
    const rest = folder.slice(prefix.length);
    if (rest) folders.add(rest.split("/")[0]);
  }
  return {
    folders: [...folders].sort((a, b) => a.localeCompare(b)),
    models: directModels.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function folderEntries(path = "") { return entriesInFolder(models, path); }
