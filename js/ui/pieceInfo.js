import { pieceAnatomyIds, pieceLabel, pieceSourceNames } from "../items/model.js";

const HOLD_MS = 650;
const STILL_PX = 28;
const EMPTY_DESCRIPTION = "No hay una ficha educativa disponible para esta pieza.";

function usefulText(value, fallback = "") {
  const text = String(value || "").trim();
  return text && text !== "pendiente" && text !== "por verificar" ? text : fallback;
}

function createElement(tag, className, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function listText(values, limit = Infinity) {
  if (!Array.isArray(values)) return "";
  return values
    .map((value) => usefulText(value).replaceAll("_", " "))
    .filter(Boolean)
    .slice(0, limit)
    .join(" · ");
}

class PieceInfoRepository {
  async find(ids, names, modelSrc) {
    const references = [
      ...ids.map((value) => ({ key: "id", value })),
      ...names.map((value) => ({ key: "name", value })),
    ];
    for (const reference of references) {
      const info = await this.fetch(reference, modelSrc);
      if (info) return info;
    }
    return null;
  }

  async fetch({ key, value }, modelSrc) {
    try {
      const query = new URLSearchParams({ [key]: value, model: modelSrc });
      const response = await fetch("/piece-info?" + query, { cache: "no-store" });
      if (!response.ok) return null;
      const data = await response.json();
      return data.info || null;
    } catch (error) {
      return null;
    }
  }
}

class PieceInfoView {
  constructor() {
    this.panel = null;
    this.content = null;
  }

  show(label, id, info) {
    this.mount();
    this.content.replaceChildren(...this.buildContent(label, id, info));
    this.panel.classList.add("visible");
  }

  hide() {
    if (this.panel) this.panel.classList.remove("visible");
  }

  mount() {
    if (this.panel) return;
    this.panel = createElement("aside", "piece-info-panel");
    this.panel.dataset.ui = "true";
    const close = createElement("button", "piece-info-close", "✕");
    close.type = "button";
    close.ariaLabel = "Cerrar";
    close.addEventListener("click", () => this.hide());
    this.content = createElement("div", "piece-info-content");
    this.panel.append(close, this.content);
    document.getElementById("ui").appendChild(this.panel);
  }

  buildContent(label, id, info) {
    const title = usefulText(info?.nombre_es, label);
    const latin = usefulText(info?.nombre_anatomico_latin);
    const location = usefulText(info?.ubicacion);
    const mainFunction = usefulText(info?.funcion_principal);
    const description = usefulText(info?.descripcion_educativa, mainFunction || EMPTY_DESCRIPTION);
    const originalName = usefulText(info?.nombre_original);
    const systems = listText(info?.sistemas);
    const specialties = listText(info?.especialidades);
    const collections = listText(info?.colecciones_origen, 6);
    return [
      createElement("div", "piece-info-kicker", "Pieza anatómica · " + (id || "sin ID vinculado")),
      createElement("h2", "piece-info-title", title),
      latin && createElement("div", "piece-info-latin", latin),
      createElement("p", "piece-info-description", description),
      info?.estado_revision === "fuente_verificada" && createElement("div", "piece-info-context", "Información médica con fuente verificada"),
      info?.estado_revision === "contexto_medico_verificado" && createElement("div", "piece-info-context", "Contexto médico con fuente · revisión específica pendiente"),
      info?.contenido_general_de && createElement("div", "piece-info-context", "Contexto general de " + info.contenido_general_de),
      info?.contenido_estructural && createElement("div", "piece-info-context", "Ficha estructural · descripción específica pendiente de revisión"),
      ...this.section("Nombre original", originalName !== title ? originalName : ""),
      ...this.section("Ubicación", location),
      ...this.section("Función principal", mainFunction),
      ...this.section("Especialidades", specialties),
      ...this.section("Colecciones de origen", collections),
      ...this.sources(info?.fuentes_verificadas),
      systems && createElement("div", "piece-info-tags", systems),
    ].filter(Boolean);
  }

  section(title, body) {
    return body
      ? [createElement("h3", "piece-info-heading", title), createElement("p", "piece-info-copy", body)]
      : [];
  }

  sources(values) {
    if (!Array.isArray(values) || !values.length) return [];
    const container = createElement("div", "piece-info-sources");
    for (const source of values) {
      if (!source?.url || !source?.titulo) continue;
      const link = createElement("a", "piece-info-source", source.organizacion + " · " + source.titulo);
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      container.appendChild(link);
    }
    return container.childElementCount
      ? [createElement("h3", "piece-info-heading", "Fuentes"), container]
      : [];
  }
}

class PieceInfoController {
  constructor(repository, view) {
    this.repository = repository;
    this.view = view;
    this.holds = new Map();
    this.owner = null;
    this.requestId = 0;
  }

  update(hand, item, part, now) {
    const key = item.id + ":" + part;
    const state = this.holds.get(hand.id);
    if (!state || state.key !== key) {
      this.holds.set(hand.id, this.createHold(key, hand, now));
      return;
    }
    if (Math.hypot(hand.ax - state.x, hand.ay - state.y) > STILL_PX) {
      Object.assign(state, this.createHold(key, hand, now));
      return;
    }
    if (!state.shown && now - state.startedAt >= HOLD_MS) {
      state.shown = true;
      this.show(hand.id, item, part);
    }
  }

  cancel(handId) {
    this.holds.delete(handId);
    if (this.owner !== handId) return;
    this.owner = null;
    this.requestId++;
    this.view.hide();
  }

  createHold(key, hand, now) {
    return { key, x: hand.ax, y: hand.ay, startedAt: now, shown: false };
  }

  async show(handId, item, part) {
    const label = pieceLabel(item, part);
    const ids = pieceAnatomyIds(item, part);
    const requestId = ++this.requestId;
    this.owner = handId;
    this.view.show(label, ids[0], null);
    const info = await this.repository.find(ids, pieceSourceNames(item, part), item.src);
    if (requestId !== this.requestId || this.owner !== handId || !info) return;
    this.view.show(label, info.id, info);
  }
}

const controller = new PieceInfoController(new PieceInfoRepository(), new PieceInfoView());

export function updatePieceInfoHold(hand, item, part, now) {
  controller.update(hand, item, part, now);
}

export function cancelPieceInfoHold(handId) {
  controller.cancel(handId);
}
