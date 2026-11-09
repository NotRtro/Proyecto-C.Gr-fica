import { PINCH, UI_TARGET, UI_PRESS, PALM } from "./config.js";
import { emit } from "./bus.js";

const KEY = "barehands.settings.v1";

const DEFAULTS = {
  pinchSensitivity: "normal",
  wire: true,
  modelLook: "original",
  autoSpin: true,
  palmTurn: "perilla",
  tutorialDone: false,
  dwellSelect: false,
  clickSound: false,
  orbPos: null,
  calibration: null,
};

const FACTORY = { ratioEnter: 0.35, ratioHold: 0.45, hysteresisPx: 10, travelMinPx: 30 };

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
  PALM.TURN = settings.palmTurn === "volante" ? "volante" : "perilla";
}
apply();

export function setSetting(key, value) {
  settings[key] = value;
  apply();
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { }
  emit("settings:changed", { key, value });
}
