from __future__ import annotations

import numpy as np

MEDIAPIPE_VERTICAL_FOV_DEG = 63.0

class PinholeCamera:
    def __init__(self, width: int, height: int,
                 vfov_deg: float = MEDIAPIPE_VERTICAL_FOV_DEG,
                 near: float = 1.0, far: float = 2000.0):
        self.width = width
        self.height = height
        self.vfov_deg = vfov_deg
        self.near = near
        self.far = far

    @property
    def aspect(self) -> float:
        return self.width / self.height

    @property
    def focal_length_px(self) -> float:
        return 0.5 * self.height / np.tan(np.radians(self.vfov_deg) * 0.5)

    def intrinsics(self) -> np.ndarray:
        f = self.focal_length_px
        return np.array([[f, 0, self.width * 0.5],
                         [0, f, self.height * 0.5],
                         [0, 0, 1]], dtype=np.float32)

    def projection_matrix(self) -> np.ndarray:
        f = 1.0 / np.tan(np.radians(self.vfov_deg) * 0.5)
        a = self.aspect
        n, fr = self.near, self.far
        m = np.zeros((4, 4), dtype=np.float32)
        m[0, 0] = f / a
        m[1, 1] = f
        m[2, 2] = (fr + n) / (n - fr)
        m[2, 3] = (2 * fr * n) / (n - fr)
        m[3, 2] = -1.0
        return m

