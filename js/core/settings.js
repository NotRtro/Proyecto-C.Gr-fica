// Preferencias del operador. Se guardan en localStorage de ESTE navegador (son
// comodidades personales, no estado de la escena). Si el almacenamiento no esta
// disponible (modo privado, bloqueado), todo funciona con los valores por defecto.
import { PINCH, UI_TARGET, UI_PRESS } from "./config.js";
import { emit } from "./bus.js";

const KEY = "barehands.settings.v1";

const DEFAULTS = {
  pinchSensitivity: "normal", // "low" (cuesta mas activar) | "normal" | "high"
  wire: true,               // wireframe del holograma
  modelMode: "holo",        // modelos GLB: "holo" (holografico) | "solid" (colores originales)
  autoSpin: true,           // giro automatico del holograma
  tutorialDone: false,
  dwellSelect: false,       // pulsar botones del menu dejando el cursor quieto (sin pinch)
  clickSound: false,        // sonido corto al pulsar un boton
  orbPos: null,             // posicion del orbe del menu {x, y} en fraccion de pantalla
  calibration: null,        // resultado del asistente "Calibrar mis manos" (docs/14 paso D)
};

// Valores de fabrica de lo que la calibracion puede personalizar.
const FACTORY = { ratioEnter: 0.35, ratioHold: 0.45, hysteresisPx: 10, travelMinPx: 30 };

// La sensibilidad del pinch es un ajuste RELATIVO sobre los cortes de "ratio"
// (separacion pulgar-indice / tamano de mano), calibrados o de fabrica.
const SENSITIVITY_OFFSET = { low: -0.07, normal: 0, high: 0.07 };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export const settings = load();

function apply() {
  const c = { ...FACTORY, ...(settings.calibration || {}) };
  const off = SENSITIVITY_OFFSET[settings.pinchSensitivity] || 0;
  PINCH.RATIO_ENTER = c.ratioEnter + off;
  PINCH.RATIO_HOLD = c.ratioHold + off;
  UI_TARGET.HYSTERESIS_PX = c.hysteresisPx;
  UI_PRESS.TRAVEL_MIN = c.travelMinPx;
}
apply();

export function setSetting(key, value) {
  settings[key] = value;
  apply();
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* sin persistencia */ }
  emit("settings:changed", { key, value });
}
