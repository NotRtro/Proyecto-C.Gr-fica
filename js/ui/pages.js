// Secciones del menu y sus acciones. Para agregar una opcion: registrar la accion
// (registerAction) y agregar su ui.button en la seccion que corresponda. Para una
// seccion nueva: registerMenuPage(id, { title, build(ui) }) y enlazarla desde
// "root" con ui.page(id, "Titulo").
import { store } from "../core/store.js";
import { emit } from "../core/bus.js";
import { HOLO } from "../core/config.js";
import { findExplodable, spawnItem, findByType, applyTransform } from "../items/registry.js";
import { cycleCamera } from "../input/camera.js";
import { resetAll } from "../stage/scene.js";
import { registerAction } from "./actions.js";
import { registerMenuPage, closeMenu, refreshMenu } from "./menu.js";
import { toast } from "./feedback.js";
import { startTutorial } from "./tutorial.js";
import { startCalibration } from "./calibration.js";
import { settings } from "../core/settings.js";

const HOLD_MS = 1500;

// ---- acciones --------------------------------------------------------------

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

function withModel(fn) {
  const m = findExplodable();
  if (!m) { toast("No hay ningún modelo en escena", { kind: "error" }); return; }
  fn(m);
  closeMenu();
}
registerAction("tools:explode", () => withModel((m) => { m.explodeTarget = HOLO.EXPLODE_OUT; }));
registerAction("tools:assemble", () => withModel((m) => { m.explodeTarget = 0; }));
registerAction("tools:center", () => withModel(centerItem));
registerAction("tools:reset", () => { resetAll(); closeMenu(); toast("Escena reiniciada"); });

registerAction("view:hud", () => { emit("hud:toggle", {}); refreshMenu(); });
registerAction("camera:cycle", () => { cycleCamera(); toast("Cambiando de cámara…"); });
registerAction("tutorial:start", () => { closeMenu(); startTutorial(); });
registerAction("calib:open", () => { closeMenu(); startCalibration(); });
registerAction("app:exit", () => { closeMenu(); emit("app:exit", {}); });

// ---- secciones -------------------------------------------------------------

registerMenuPage("root", {
  title: "Menú",
  build: (ui) => [
    ui.page("models", "Modelos"),
    ui.page("tools", "Herramientas"),
    ui.page("view", "Vista"),
    ui.page("help", "Gestos"),
    ui.page("settings", "Ajustes"),
    ui.button({ label: "Salir", action: "app:exit", hold: HOLD_MS, danger: true, hint: "mantener presionado" }),
  ],
});

registerMenuPage("models", {
  title: "Modelos",
  build: (ui) => [
    ui.button({ label: "reactor.holo", action: "model:reactor",
      hint: findByType("holo") ? "en escena · traer al centro" : "agregar a la escena" }),
    ui.note("Catálogo GLB (bicicleta…) en la fase 6."),
  ],
});

registerMenuPage("tools", {
  title: "Herramientas",
  build: (ui) => [
    ui.button({ label: "Desarmar", action: "tools:explode" }),
    ui.button({ label: "Armar", action: "tools:assemble" }),
    ui.button({ label: "Centrar modelo", action: "tools:center" }),
    ui.button({ label: "Reiniciar escena", action: "tools:reset", hold: HOLD_MS, danger: true,
      hint: "mantener · borra tarjetas e imágenes" }),
  ],
});

registerMenuPage("view", {
  title: "Vista",
  build: (ui) => [
    ui.toggle("wire", "Wireframe"),
    ui.toggle("autoSpin", "Giro automático"),
    ui.button({ label: "Depuración", action: "view:hud", hint: "tecla H", selected: store.showHud }),
  ],
});

const GESTURES = [
  ["Pinch + arrastrar", "mover un objeto"],
  ["Tap", "pinch rápido: pulsar / expandir"],
  ["Dos manos", "separar = escalar · girar = rotar"],
  ["Pinch en vacío ↔", "derecha desarma · izquierda arma"],
  ["Pinch rápido en el orbe", "abre o cierra este menú · mantener y mover = moverlo"],
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
  ],
});

registerMenuPage("settings", {
  title: "Ajustes",
  build: (ui) => [
    ui.section("Selección en el menú"),
    ui.toggle("dwellSelect", "Seleccionar dejando el cursor quieto"),
    ui.note("Con esto activado, dejar la mano quieta 0.8 s sobre una opción la pulsa, sin pinch (Salir y Reiniciar siguen pidiendo mantener)."),
    ui.toggle("clickSound", "Sonido al pulsar"),
    ui.section("Calibración de la mano"),
    ui.button({ label: "Calibrar mis manos", action: "calib:open",
      hint: settings.calibration
        ? "calibrado · temblor " + settings.calibration.jitterPx + " px · pinch bajo " + settings.calibration.ratioEnter
        : "10 s · ajusta el pinch y el menú a tu mano" }),
    ...(settings.calibration ? [ui.button({ label: "Volver a valores de fábrica", action: "calib:reset" })] : []),
    ui.section("Sensibilidad del pinch"),
    ui.choice("pinchSensitivity", [["low", "Baja"], ["normal", "Normal"], ["high", "Alta"]]),
    ui.button({ label: "Cambiar de cámara", action: "camera:cycle" }),
    ui.button({ label: "Reubicar el orbe", action: "menu:orb-reset", hint: "vuelve a su lugar original" }),
  ],
});
