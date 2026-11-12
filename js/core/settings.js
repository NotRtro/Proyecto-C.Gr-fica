import { PINCH, PINCH_CLOSED, UI_TARGET, UI_PRESS, PALM, CURSOR_FILTER } from "./config.js";
import { emit } from "./bus.js";

const KEY = "barehands.settings.v1";

const DEFAULTS = {
  settingsVersion: 2,
  pinchSensitivity: "normal",
  wire: true,
  modelLook: "original",
  autoSpin: true,
  palmTurn: "perilla",
  tutorialDone: false,
  dwellSelect: true,
  dwellTime: "800",
  clickSound: false,
  orbPos: null,
  calibration: null,
};

const FACTORY = {
  ratioEnter: 0.35, ratioHold: 0.45,
  archEnter: 0.18, archHold: 0.12,
  backEnter: 1.30, backHold: 1.15,
  f8Enter: 0.9, f8Hold: 0.8,
  closedEnterK: 0.6, closedHoldK: 0.75,
  fistVeto: false,
  hysteresisPx: 10, travelMinPx: 30, minCutoff: 1.2,
};

const SENSITIVITY_OFFSET = { low: -0.07, normal: 0, high: 0.07 };
const DWELL_TIMES = { 800: 800, 1000: 1000, 1200: 1200 };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    const migrated = { ...DEFAULTS, ...saved };
    if ((saved.settingsVersion || 0) < 2) {
      migrated.settingsVersion = 2;
      migrated.dwellSelect = true;
      localStorage.setItem(KEY, JSON.stringify(migrated));
    }
    return migrated;
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
  PINCH.ARCH_ENTER = c.archEnter; PINCH.ARCH_HOLD = c.archHold;
  PINCH.BACKMEAN_ENTER = c.backEnter; PINCH.BACKMEAN_HOLD = c.backHold;
  PINCH_CLOSED.F8_ENTER = c.f8Enter; PINCH_CLOSED.F8_HOLD = c.f8Hold;
  PINCH_CLOSED.RATIO_ENTER_K = c.closedEnterK; PINCH_CLOSED.RATIO_HOLD_K = c.closedHoldK;
  PINCH_CLOSED.FIST_VETO = !!c.fistVeto;
  UI_TARGET.HYSTERESIS_PX = c.hysteresisPx;
  UI_PRESS.TRAVEL_MIN = c.travelMinPx;
  CURSOR_FILTER.minCutoff = c.minCutoff;
  UI_TARGET.DWELL_MS = DWELL_TIMES[settings.dwellTime] || DWELL_TIMES[DEFAULTS.dwellTime];
  PALM.TURN = settings.palmTurn === "volante" ? "volante" : "perilla";
}
apply();

export function setSetting(key, value) {
  settings[key] = value;
  apply();
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { }
  emit("settings:changed", { key, value });
}
