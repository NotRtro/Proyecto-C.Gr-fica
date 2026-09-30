// Menu holografico flotante (estilo barehands): un ORBE que flota en la escena
// y, al tocarlo, un PANEL translucido con las secciones en forma de arbol
// (▸ carpeta / ■ opcion). Se abre y se cierra con un grab rapido (pinch) sobre
// el orbe o con la tecla M; tambien se cierra con la X, con Esc o tocando en
// vacio (fuera del panel y de cualquier objeto).
//
// El orbe y el panel se pueden ARRASTRAR con pinch (o el mouse): el orbe desde
// cualquier parte, el panel desde su barra de titulo. Mientras el panel no se
// haya movido a mano, sigue al orbe. La posicion del orbe se recuerda
// (preferencias) como fraccion de la pantalla.
//
// La escena NO se bloquea con el menu abierto: el panel es chico y solo tapa su
// propia area (data-ui), asi que un pinch sobre el nunca toca lo de atras.
//
// Las secciones son paginas registradas (registerMenuPage). La pagina "root"
// enlaza a las demas con ui.page(id, ...), que se despliegan en el lugar
// (acordeon: una abierta a la vez). Ver js/ui/pages.js.
import { on, emit } from "../core/bus.js";
import { settings, setSetting } from "../core/settings.js";
import { input } from "../stage/interaction.js";
import { registerAction } from "./actions.js";

const APP_NAME = "HeyTECHI";
const PAGES = new Map();
const GAP = 18; // separacion orbe-panel

let orb, panel, bodyEl, subEl;
let isOpen = false;
let openFolder = null;
let panelDetached = false;

export function registerMenuPage(id, def) { PAGES.set(id, def); }

// ---- constructores de elementos para las paginas ---------------------------

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    e.setAttribute(k, v === true ? "" : v);
  }
  if (text !== undefined) e.textContent = text;
  return e;
}

export const ui = {
  // Opcion del arbol. hold: ms a mantener (acciones destructivas).
  button({ label, action, arg, hint, hold, selected, danger }) {
    const b = el("button", {
      class: "holo-row" + (selected ? " selected" : "") + (danger ? " danger" : "") + (hold ? " hold" : ""),
      type: "button", "data-action": action, "data-arg": arg, "data-hold": hold,
    });
    b.appendChild(el("span", { class: "holo-glyph" }, hold ? "◉" : "■"));
    const txt = el("span", { class: "holo-label" }, label);
    if (hint) txt.appendChild(el("small", {}, hint));
    b.appendChild(txt);
    return b;
  },
  // Carpeta que despliega otra pagina en el lugar.
  page(id, label) {
    const openNow = openFolder === id;
    const wrap = el("div", { class: "holo-folder" + (openNow ? " open" : "") });
    const row = el("button", { class: "holo-row folder", type: "button", "data-action": "menu:folder", "data-arg": id });
    row.appendChild(el("span", { class: "holo-glyph" }, openNow ? "▾" : "▸"));
    row.appendChild(el("span", { class: "holo-label" }, label));
    wrap.appendChild(row);
    if (openNow && PAGES.has(id)) {
      const kids = el("div", { class: "holo-children" });
      kids.append(...PAGES.get(id).build(ui));
      wrap.appendChild(kids);
    }
    return wrap;
  },
  section(title) { return el("div", { class: "holo-section" }, title); },
  note(text) { return el("p", { class: "holo-note" }, text); },
  // Opciones exclusivas ligadas a una preferencia (chips).
  choice(key, options) {
    const row = el("div", { class: "holo-chips" });
    for (const [value, label] of options) {
      row.appendChild(el("button", {
        class: "holo-chip" + (settings[key] === value ? " selected" : ""), type: "button",
        "data-action": "setting:set", "data-arg": key + "=" + value,
      }, label));
    }
    return row;
  },
  toggle(key, label) {
    const on = !!settings[key];
    const b = ui.button({ label, action: "setting:toggle", arg: key, selected: on });
    b.appendChild(el("span", { class: "holo-pill" + (on ? " on" : "") }, on ? "ON" : "OFF"));
    return b;
  },
  row(...children) { const r = el("div", { class: "holo-inline" }); r.append(...children); return r; },
  el,
};

// ---- posicion ----------------------------------------------------------------

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// El alto maximo del panel llega hasta el borde inferior; si el contenido no
// entra, el cuerpo hace scroll (el panel no se reacomoda solo).
function fitPanelHeight() {
  panel.style.maxHeight = Math.max(160, innerHeight - panel.offsetTop - 8) + "px";
}

// Coloca el panel junto al orbe (a la derecha, o a la izquierda si no entra).
// Solo al abrir, al mover el orbe o al cambiar el tamano de la ventana: nunca al
// desplegar una carpeta, para que las filas no se muevan bajo la mano.
function placePanelNearOrb() {
  if (panelDetached || !isOpen) return;
  panel.style.maxHeight = "";
  const o = orb.getBoundingClientRect();
  const w = panel.offsetWidth, h = panel.offsetHeight;
  let x = o.right + GAP;
  if (x + w > innerWidth - 8) x = o.left - GAP - w;
  panel.style.left = clamp(x, 8, innerWidth - w - 8) + "px";
  panel.style.top = clamp(o.top - 20, 8, innerHeight - h - 8) + "px";
  fitPanelHeight();
}

// ---- abrir / cerrar / navegar ----------------------------------------------

function render() {
  const root = PAGES.get("root");
  if (!root) return;
  bodyEl.replaceChildren(...root.build(ui));
  const n = bodyEl.querySelectorAll(":scope > .holo-folder").length;
  subEl.textContent = n + " secciones";
  orb.querySelector(".orb-sub").textContent = n + " secciones";
}

export function openMenu(folder = null) {
  openFolder = folder;
  isOpen = true;
  document.body.classList.add("menu-open");
  render();
  placePanelNearOrb();
  emit("menu:open", {});
}

export function closeMenu() {
  if (!isOpen) return;
  isOpen = false;
  document.body.classList.remove("menu-open");
  emit("menu:close", {});
}

export function toggleMenu() { if (isOpen) closeMenu(); else openMenu(); }
export function menuIsOpen() { return isOpen; }

registerAction("menu:toggle", () => toggleMenu());
// Ajustes > "Reubicar el orbe": vuelve a la posicion de fabrica y la olvida.
registerAction("menu:orb-reset", () => {
  setSetting("orbPos", null);
  panelDetached = false;
  placeOrbDefault();
  placePanelNearOrb();
});
registerAction("menu:close", () => closeMenu());
// Desplegar/plegar una carpeta. Si al plegar otra carpeta de arriba esta fila se
// desplazaria, se compensa moviendo el panel: la fila tocada queda EXACTAMENTE
// donde estaba, bajo la mano, lista para el siguiente pinch.
registerAction("menu:folder", (id) => {
  const sel = '[data-action="menu:folder"][data-arg="' + id + '"]';
  const before = bodyEl.querySelector(sel);
  const y0 = before ? before.getBoundingClientRect().top : null;
  openFolder = openFolder === id ? null : id;
  render();
  const after = bodyEl.querySelector(sel);
  if (after && y0 !== null) {
    const dy = y0 - after.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) panel.style.top = Math.max(8, panel.offsetTop + dy) + "px";
  }
  fitPanelHeight();
});
registerAction("setting:set", (arg) => {
  const [key, value] = arg.split("=");
  setSetting(key, value);
});
registerAction("setting:toggle", (key) => setSetting(key, !settings[key]));

export function mountMenu() {
  const root = document.getElementById("ui");

  orb = el("button", { id: "holo-orb", class: "holo-orb", type: "button", "data-ui": true,
    "data-action": "menu:toggle", "data-drag": "holo-orb", title: "Menú (M) · arrastra para mover" });
  orb.appendChild(el("span", { class: "orb-title" }, APP_NAME));
  orb.appendChild(el("span", { class: "orb-sub" }, "tocar · arrastrar"));
  placeOrbDefault();

  panel = el("section", { id: "holo-panel", class: "holo-panel", "data-ui": true, "aria-label": "Menú" });
  const bar = el("div", { class: "holo-bar", "data-drag": "holo-panel" });
  const titles = el("div", { class: "holo-titles" });
  titles.appendChild(el("span", { class: "holo-title" }, APP_NAME));
  subEl = el("span", { class: "holo-sub" });
  titles.appendChild(subEl);
  bar.appendChild(titles);
  bar.appendChild(el("button", { class: "holo-close", type: "button", "data-action": "menu:close",
    "aria-label": "Cerrar" }, "✕"));
  bodyEl = el("div", { class: "holo-body" });
  panel.append(bar, bodyEl);
  root.append(orb, panel);

  on("settings:changed", () => { if (isOpen) render(); });
  // Tocar en vacio (tap sin objeto y fuera de la interfaz) cierra el menu.
  on("cursor:tap", ({ item, x, y }) => { if (isOpen && !item && !uiAt(x, y)) closeMenu(); });
  // Recordar donde el usuario dejo el orbe.
  on("ui:dragged", ({ id }) => {
    if (id !== "holo-orb") return;
    setSetting("orbPos", { x: orb.offsetLeft / innerWidth, y: orb.offsetTop / innerHeight });
  });
  on("ui:drag", ({ id }) => {
    if (id === "holo-panel") panelDetached = true;
    else if (id === "holo-orb") placePanelNearOrb();
  });
  addEventListener("resize", () => { placeOrbDefault(); placePanelNearOrb(); });
  render(); // llena el panel (oculto) y el contador de secciones del orbe
}

// Posicion del orbe: la guardada por el usuario o la de fabrica (izquierda, 30%).
// useSaved=false fuerza la de fabrica (replays: cada vuelta debe ser identica).
function placeOrbDefault(useSaved = true) {
  const saved = useSaved ? settings.orbPos : null;
  const w = orb.offsetWidth || 140, h = orb.offsetHeight || 140;
  const x = saved ? saved.x * innerWidth : 48;
  const y = saved ? saved.y * innerHeight : innerHeight * 0.3;
  orb.style.left = Math.round(clamp(x, 0, innerWidth - w)) + "px";
  orb.style.top = Math.round(clamp(y, 0, innerHeight - h)) + "px";
}

function uiAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return !!(el && el.closest("[data-ui]"));
}

// Vuelve al estado inicial: menu cerrado y orbe/panel en su lugar por defecto
// (cada vuelta de un replay debe ser identica).
export function resetMenuLayout() {
  closeMenu();
  openFolder = null;
  panelDetached = false;
  placeOrbDefault(false);
}

// Permite a otras paginas pedir un re-dibujo (p. ej. tras cambiar el HUD).
export function refreshMenu() { if (isOpen) render(); }
