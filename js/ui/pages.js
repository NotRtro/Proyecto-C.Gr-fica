import { store } from "../core/store.js";
import { emit, on } from "../core/bus.js";
import { HOLO, MODEL, UI_PRESS } from "../core/config.js";
import { findExplodable, spawnItem, findByType, findItem, removeItem, applyTransform } from "../items/registry.js";
import { catalog, catalogLoaded, refreshCatalog, folderEntries } from "../net/catalog.js";
import { addModel } from "../stage/models.js";
import { startGuide, stopGuide, undoLastPiece, resetModelPieces } from "../items/model.js";
import { cycleCamera } from "../input/camera.js";
import { resetAll } from "../stage/scene.js";
import { registerAction } from "./actions.js";
import { registerMenuPage, closeMenu, refreshMenu } from "./menu.js";
import { toast } from "./feedback.js";
import { startTutorial } from "./tutorial.js";
import { startCalibration } from "./calibration.js";
import { settings } from "../core/settings.js";

function centerItem(it) {
  it.x = innerWidth / 2; it.y = innerHeight * 0.45; it.scale = 1;
  applyTransform(it);
}

registerAction("model:reactor", () => {
  const holo = findByType("holo");
  if (holo) { centerItem(holo); toast("El reactor ya estaba en escena: lo traje al centro"); }
  else spawnItem("holo", {});
  closeMenu();
});

registerAction("model:add", (src) => { addModel(src); closeMenu(); });
registerAction("model:remove", (id) => {
  const it = findItem(id);
  if (it) { removeItem(it); toast("Se quitó " + (it.title || "el modelo")); }
  refreshMenu();
});
registerAction("model:refresh", () => { refreshCatalog().then(refreshMenu); });
let modelFolder = "";
registerAction("model:folder", (folder) => { modelFolder = folder || ""; refreshMenu(); });
on("menu:open", () => { refreshCatalog().then(refreshMenu); });
on("model:loaded", ({ item, stats }) => {
  toast((item.title || "Modelo") + " listo · " + stats.parts + " piezas · " + Math.round(stats.triangles / 1000) + " mil triángulos");
  if (stats.skinned) toast((item.title || "El modelo") + " tiene esqueleto (personaje): se puede mover, pero no desarmar", { kind: "error", ms: 7000 });
  else if (stats.parts < 2) toast((item.title || "El modelo") + " es una sola pieza: se puede mover, pero no desarmar. Sepáralo en Blender (P › By Loose Parts)", { kind: "error", ms: 9000 });
});
on("piece:drop", ({ snapped, label, placed, total }) => {
  if (snapped) toast("Encajada: " + label + " · " + placed + " de " + total, { ms: 1600 });
});
on("model:assembled", ({ item }) => {
  toast("¡" + (item.title || "Modelo") + " armado!", { ms: 3500 });
});
on("model:error", ({ item }) => {
  toast("No se pudo cargar " + (item.title || item.src), { kind: "error" });
});

function withModel(fn) {
  const m = findExplodable();
  if (!m) { toast("No hay ningún modelo en escena", { kind: "error" }); return; }
  fn(m);
  closeMenu();
}
registerAction("tools:explode", () => withModel((m) => { m.explodeTarget = HOLO.EXPLODE_OUT; }));
registerAction("tools:assemble", () => withModel((m) => { m.explodeTarget = 0; }));
registerAction("tools:center", () => withModel(centerItem));
registerAction("tools:spin", () => withModel((m) => {
  m.spinPaused = !m.spinPaused;
  emit("spin:changed", { item: m, paused: m.spinPaused });
  toast((m.spinPaused ? "Giro detenido · " : "Giro reanudado · ") + (m.title || "modelo"));
}));
registerAction("tools:reset", () => { resetAll(); closeMenu(); toast("Escena reiniciada"); });
registerAction("tools:undo", () => withModel((m) => {
  const label = undoLastPiece(m);
  toast(label ? "Deshecho: " + label + " vuelve a estar suelta" : "No hay piezas encajadas para deshacer");
}));
registerAction("tools:reset-pieces", () => withModel((m) => {
  if (resetModelPieces(m)) toast("Piezas reiniciadas: todas sueltas");
  else toast((m.title || "Este modelo") + " no se arma por piezas", { kind: "error" });
}));
registerAction("tools:guide", () => withModel((m) => {
  if (m.guide) { stopGuide(m); return; }
  if (!startGuide(m)) toast((m.title || "Este modelo") + " no se puede armar por piezas", { kind: "error" });
}));

registerAction("view:hud", () => { emit("hud:toggle", {}); refreshMenu(); });
registerAction("camera:cycle", () => { cycleCamera(); toast("Cambiando de cámara…"); });
registerAction("tutorial:start", () => { closeMenu(); startTutorial("basico"); });
registerAction("tutorial:pieces", () => { closeMenu(); startTutorial("piezas"); });
registerAction("calib:open", () => { closeMenu(); startCalibration(); });
registerAction("app:exit", () => { closeMenu(); emit("app:exit", {}); });

registerMenuPage("root", {
  title: "Menú",
  build: (ui) => [
    ui.page("models", "Modelos"),
    ui.page("tools", "Herramientas"),
    ui.page("view", "Vista"),
    ui.page("help", "Gestos"),
    ui.page("settings", "Ajustes"),
    ui.button({ label: "Salir", action: "app:exit", hold: UI_PRESS.CONFIRM_MS, danger: true, hint: "mantener presionado" }),
  ],
});

const mb = (bytes) => (bytes / 1e6).toFixed(1) + " MB";
const inScene = (src) => store.items.find((it) => it.type === "model" && it.src === src);
const parentFolder = (path) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const childFolder = (path, name) => path ? path + "/" + name : name;

function modelButton(ui, model) {
  return ui.button({
    label: model.name,
    action: "model:add",
    arg: model.src,
    hint: (inScene(model.src) ? "en escena · traer al centro" : "agregar") + " · " + mb(model.bytes),
  });
}

function buildModelsPage(ui) {
  const entries = folderEntries(modelFolder);
  const rows = modelFolder
    ? [ui.button({
      label: "← Volver",
      action: "model:folder",
      arg: parentFolder(modelFolder),
      hint: "Modelos / " + modelFolder,
    })]
    : [ui.button({
      label: "reactor.holo",
      action: "model:reactor",
      hint: findByType("holo") ? "en escena · traer al centro" : "integrado · agregar",
    })];

  rows.push(...entries.folders.map((folder) => ui.button({
    label: "▸ " + folder,
    action: "model:folder",
    arg: childFolder(modelFolder, folder),
    hint: "abrir carpeta",
  })));
  rows.push(...entries.models.map((model) => modelButton(ui, model)));

  if (!catalogLoaded()) rows.push(ui.note("Leyendo el catálogo…"));
  else if (!catalog().length) rows.push(ui.note("Pon archivos .glb en media/models para verlos aquí."));
  else if (!entries.folders.length && !entries.models.length) rows.push(ui.note("Esta carpeta no contiene modelos."));

  const glbCount = store.items.filter((item) => item.type === "model").length;
  const present = store.items.filter((item) => item.type === "model" || item.type === "holo");
  if (present.length) {
    rows.push(ui.section("En escena · modelos GLB " + glbCount + " de " + MODEL.MAX_IN_SCENE));
    rows.push(...present.map((item) => ui.button({
      label: "Quitar " + (item.title || "modelo"),
      action: "model:remove",
      arg: item.id,
    })));
  }
  rows.push(ui.button({ label: "Actualizar catálogo", action: "model:refresh" }));
  return rows;
}

registerMenuPage("models", {
  title: "Modelos",
  build: buildModelsPage,
});

registerMenuPage("tools", {
  title: "Herramientas",
  build: (ui) => [
    ui.button({ label: "Desarmar", action: "tools:explode" }),
    ui.button({ label: "Armar", action: "tools:assemble" }),
    ui.button({ label: findExplodable() && findExplodable().guide ? "Terminar armado guiado" : "Armado guiado",
      action: "tools:guide", hint: "pieza por pieza, en orden" }),
    ui.button({ label: "Deshacer última pieza", action: "tools:undo", hint: "la vuelve a sacar" }),
    ui.button({ label: "Reiniciar piezas", action: "tools:reset-pieces", hold: UI_PRESS.CONFIRM_MS,
      hint: "mantener · todas sueltas otra vez" }),
    ui.button({ label: "Centrar modelo", action: "tools:center" }),
    ui.button({ label: findExplodable() && findExplodable().spinPaused ? "Reanudar giro" : "Detener giro",
      action: "tools:spin", hint: "o palma de \"alto\" quieta" }),
    ui.button({ label: "Reiniciar escena", action: "tools:reset", hold: UI_PRESS.CONFIRM_MS, danger: true,
      hint: "mantener · borra tarjetas e imágenes" }),
  ],
});

registerMenuPage("view", {
  title: "Vista",
  build: (ui) => [
    ui.section("Modelos 3D"),
    ui.choice("modelLook", [["original", "Original"], ["holo", "Holográfico"]]),
    ui.note("Original: texturas y colores del modelo; si no trae, se ve holográfico."),
    ui.section("Reactor"),
    ui.toggle("wire", "Wireframe"),
    ui.toggle("autoSpin", "Giro automático"),
    ui.button({ label: "Depuración", action: "view:hud", hint: "tecla H", selected: store.showHud }),
  ],
});

const GESTURES = [
  ["Pinch + arrastrar", "mover un objeto"],
  ["Tap", "pinch rápido: pulsar / expandir"],
  ["Dos pinzas sobre el modelo", "gira la línea entre las manos para rotar · separa para escalar"],
  ["Pinch en vacío ↔", "derecha desarma · izquierda arma"],
  ["Pinch sobre una pieza", "con el modelo desarmado: sacarla · cerca de su lugar encaja"],
  ["Palma de \"alto\" quieta", "detiene o reanuda el giro del modelo"],
  ["Rotación Perilla", "dedos extendidos hacia la cámara y gira la muñeca"],
  ["Rotación Volante", "en Ajustes elige Volante; muestra la palma e inclínala a izquierda o derecha"],
  ["Pinch rápido en el orbe", "abre o cierra este menú · mantener y mover = moverlo"],
  ["Desplazar el menú", "lleva la mano sin pinza al borde inferior para bajar o al superior para subir"],
  ["Pinch en vacío (rápido)", "cierra este menú"],
  ["Mouse", "arrastrar · rueda escala · Shift+rueda rota"],
];

registerMenuPage("help", {
  title: "Gestos",
  build: (ui) => [
    ...GESTURES.map(([name, text]) => {
      const row = ui.el("div", { class: "holo-info" });
      row.append(ui.el("span", { class: "holo-glyph" }, "·"), ui.el("strong", {}, name), ui.el("span", {}, text));
      return row;
    }),
    ui.note("Teclas: M menú · Esc cerrar · H depuración · C cámara · G grabar · R recargar"),
    ui.button({ label: "Repetir tutorial", action: "tutorial:start" }),
    ui.button({ label: "Practicar piezas", action: "tutorial:pieces", hint: "desarmar, sacar y encajar · 5 pasos" }),
  ],
});

registerMenuPage("settings", {
  title: "Ajustes",
  build: (ui) => [
    ui.section("Selección en el menú"),
    ui.toggle("dwellSelect", "Usar el menú dejando la mano quieta"),
    ...(settings.dwellSelect ? [ui.choice("dwellTime", [["800", "0,8 s"], ["1000", "1 s"], ["1200", "1,2 s"]])] : []),
    ui.note("Apunta una opción durante el tiempo elegido o haz una pinza rápida. Salir y Reiniciar siempre exigen mantener la pinza."),
    ui.toggle("clickSound", "Sonido al pulsar"),
    ui.section("Calibración de la mano"),
    ui.button({ label: "Calibrar mis manos", action: "calib:open",
      hint: settings.calibration
        ? "calibrado · temblor " + settings.calibration.jitterPx + " px · pinch bajo " + settings.calibration.ratioEnter
        : "10 s · ajusta el pinch y el menú a tu mano" }),
    ...(settings.calibration ? [ui.button({ label: "Volver a valores de fábrica", action: "calib:reset" })] : []),
    ui.section("Girar el modelo con la palma"),
    ui.choice("palmTurn", [["perilla", "Perilla"], ["volante", "Volante"]]),
    ui.note("Perilla: dedos hacia la cámara y girar la muñeca. Volante: palma de \"alto\" inclinada a un lado (más estable si la cámara no ve bien la profundidad)."),
    ui.section("Sensibilidad del pinch"),
    ui.choice("pinchSensitivity", [["low", "Baja"], ["normal", "Normal"], ["high", "Alta"]]),
    ui.button({ label: "Cambiar de cámara", action: "camera:cycle" }),
    ui.button({ label: "Reubicar el orbe", action: "menu:orb-reset", hint: "vuelve a su lugar original" }),
  ],
});
