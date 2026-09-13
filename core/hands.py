from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

WRIST = 0
THUMB_TIP, INDEX_TIP, PINKY_TIP = 4, 8, 20
INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP = 5, 9, 13, 17

FINGER_CHAINS = {
    "pulgar":  (1, 2, 3, 4),
    "indice":  (5, 6, 7, 8),
    "medio":   (9, 10, 11, 12),
    "anular":  (13, 14, 15, 16),
    "menique": (17, 18, 19, 20),
}

BONES = [(0, 1), (1, 2), (2, 3), (3, 4),
         (0, 5), (5, 6), (6, 7), (7, 8),
         (0, 9), (9, 10), (10, 11), (11, 12),
         (0, 13), (13, 14), (14, 15), (15, 16),
         (0, 17), (17, 18), (18, 19), (19, 20),
         (5, 9), (9, 13), (13, 17)]

class OneEuro:

    def __init__(self, freq=30.0, min_cutoff=1.0, beta=0.35, d_cutoff=1.0):
        self.freq = freq
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x_prev = None
        self._dx_prev = None

    @staticmethod
    def _alpha(cutoff, freq):
        tau = 1.0 / (2.0 * np.pi * cutoff)
        te = 1.0 / freq
        return 1.0 / (1.0 + tau / te)

    def __call__(self, x, dt=None):
        x = np.asarray(x, dtype=np.float64)
        if dt and dt > 1e-6:
            self.freq = 1.0 / dt
        if self._x_prev is None:
            self._x_prev = x.copy()
            self._dx_prev = np.zeros_like(x)
            return x
        dx = (x - self._x_prev) * self.freq
        a_d = self._alpha(self.d_cutoff, self.freq)
        dx_hat = a_d * dx + (1 - a_d) * self._dx_prev
        cutoff = self.min_cutoff + self.beta * np.abs(dx_hat)
        a = self._alpha(np.maximum(cutoff, 1e-3), self.freq)
        x_hat = a * x + (1 - a) * self._x_prev
        self._x_prev, self._dx_prev = x_hat, dx_hat
        return x_hat

def finger_curl(pts: np.ndarray, chain) -> float:
    a, b, c, d = (pts[i] for i in chain)
    total = 0.0
    for u, v in ((b - a, c - b), (c - b, d - c)):
        nu, nv = np.linalg.norm(u), np.linalg.norm(v)
        if nu < 1e-6 or nv < 1e-6:
            continue
        cos = np.clip(float(np.dot(u, v)) / (nu * nv), -1.0, 1.0)
        total += np.arccos(cos)
    return float(np.clip(total / (np.pi * 1.15), 0.0, 1.0))

def palm_width(pts: np.ndarray) -> float:
    return float(np.linalg.norm(pts[INDEX_MCP] - pts[PINKY_MCP]) + 1e-6)

@dataclass
class HandFeatures:
    present: bool = False
    handedness: str = ""
    pts_px: np.ndarray = field(default_factory=lambda: np.zeros((21, 3)))
    curls: dict = field(default_factory=dict)
    pinch: float = 1.0
    spread: float = 0.0
    openness: float = 0.0
    center: np.ndarray = field(default_factory=lambda: np.zeros(3))
    width_px: float = 1.0
    gesture: str = "reposo"

def extract_features(pts_px: np.ndarray, handedness: str = "") -> HandFeatures:
    f = HandFeatures(present=True, handedness=handedness, pts_px=pts_px)
    f.width_px = palm_width(pts_px)
    f.curls = {name: finger_curl(pts_px, ch) for name, ch in FINGER_CHAINS.items()}
    f.pinch = float(np.linalg.norm(pts_px[THUMB_TIP] - pts_px[INDEX_TIP]) / f.width_px)
    f.spread = float(np.linalg.norm(pts_px[INDEX_TIP] - pts_px[PINKY_TIP]) / f.width_px)
    longs = [f.curls[k] for k in ("indice", "medio", "anular", "menique")]
    f.openness = float(1.0 - np.mean(longs))
    f.center = pts_px[[WRIST, INDEX_MCP, PINKY_MCP, MIDDLE_MCP]].mean(axis=0)
    return f

TH = {
    "pinch_on": 0.42, "pinch_off": 0.62,
    "open_on": 0.70, "open_off": 0.52,
    "fist_on": 0.26, "fist_off": 0.42,
    "spread_on": 1.60, "spread_off": 1.35,
}
HOLD_FRAMES = 3

class GestureMachine:

    def __init__(self):
        self.state = "reposo"
        self._candidate = "reposo"
        self._count = 0

    def _raw(self, f: HandFeatures) -> str:
        if not f.present:
            return "reposo"
        cur = self.state
        pinch_th = TH["pinch_off"] if cur == "pinza" else TH["pinch_on"]

        if (f.pinch < pinch_th
                and 0.12 < f.curls["indice"] < 0.75):
            return "pinza"
        fist_th = TH["fist_off"] if cur == "puno" else TH["fist_on"]
        if f.openness < fist_th:
            return "puno"
        if f.curls["indice"] < 0.30 and np.mean(
                [f.curls[k] for k in ("medio", "anular", "menique")]) > 0.52:
            return "apuntar"
        spread_th = TH["spread_off"] if cur == "abrir" else TH["spread_on"]
        open_th = TH["open_off"] if cur in ("palma", "abrir") else TH["open_on"]
        if f.openness > open_th and f.spread > spread_th:
            return "abrir"
        if f.openness > open_th:
            return "palma"
        return "reposo"

    def update(self, f: HandFeatures) -> str:
        raw = self._raw(f)
        if raw == self._candidate:
            self._count += 1
        else:
            self._candidate, self._count = raw, 1
        if self._count >= HOLD_FRAMES and raw != self.state:
            self.state = raw
        f.gesture = self.state
        return self.state

