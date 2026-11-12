import { on, emit } from "../core/bus.js";
import { settings, setSetting } from "../core/settings.js";
import { input } from "../stage/interaction.js";
import { registerAction } from "./actions.js";

const APP_NAME = "HeyTECHI";
const PAGES = new Map();
const GAP = 18;

let orb, panel, bodyEl, subEl;
let isOpen = false;
let openFolder = null;
let panelDetached = false;

export function registerMenuPage(id, def) { PAGES.set(id, def); }

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

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function fitPanelHeight() {
  panel.style.maxHeight = Math.max(160, innerHeight - panel.offsetTop - 8) + "px";
}

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

function render() {
  const root = PAGES.get("root");
  if (!root) return;
  bodyEl.replaceChildren(...root.build(ui));
  const n = bodyEl.querySelectorAll(":scope > .holo-folder").length;
  subEl.textContent = n + " secciones";
  orb.querySelector(".orb-sub").textContent = "quieta 0,8 s · pinza";
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
registerAction("menu:orb-reset", () => {
  setSetting("orbPos", null);
  panelDetached = false;
  placeOrbDefault();
  placePanelNearOrb();
});
registerAction("menu:close", () => closeMenu());
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
  orb.appendChild(el("span", { class: "orb-sub" }, "quieta 0,8 s · pinza"));
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
  on("cursor:tap", ({ item, x, y }) => { if (isOpen && !item && !uiAt(x, y)) closeMenu(); });
  on("ui:dragged", ({ id }) => {
    if (id !== "holo-orb") return;
    setSetting("orbPos", { x: orb.offsetLeft / innerWidth, y: orb.offsetTop / innerHeight });
  });
  on("ui:drag", ({ id }) => {
    if (id === "holo-panel") panelDetached = true;
    else if (id === "holo-orb") placePanelNearOrb();
  });
  addEventListener("resize", () => { placeOrbDefault(); placePanelNearOrb(); });
  render();
}

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

export function resetMenuLayout() {
  closeMenu();
  openFolder = null;
  panelDetached = false;
  placeOrbDefault(false);
}

export function refreshMenu() { if (isOpen) render(); }
