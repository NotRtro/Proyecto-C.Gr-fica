from __future__ import annotations

import threading
import time

import cv2
import numpy as np

class Slot:

    __slots__ = ("_v", "_t", "_lock", "_seq")

    def __init__(self):
        self._v = None
        self._t = 0.0
        self._seq = 0
        self._lock = threading.Lock()

    def put(self, value, stamp=None):
        with self._lock:
            self._v = value
            self._t = time.perf_counter() if stamp is None else stamp
            self._seq += 1

    def get(self):
        with self._lock:
            return self._v, self._t, self._seq

def _try_open(cam_id, backend, width, height, mjpg, fps):
    cap = cv2.VideoCapture(cam_id, backend) if backend is not None \
        else cv2.VideoCapture(cam_id)
    if not cap.isOpened():
        cap.release()
        return None, None
    try:
        if mjpg:
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        if width:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        if fps:
            cap.set(cv2.CAP_PROP_FPS, fps)

        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:
        pass
    ok, frame = cap.read()
    if not ok or frame is None or frame.size == 0:
        cap.release()
        return None, None
    return cap, frame

APP_HOGS = ("zoom", "teams", "obs", "skype", "discord", "webexmta",
            "windowscamera", "cameraapp")

def camera_hogs():
    try:
        import subprocess
        out = subprocess.run(
            ["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True,
            timeout=5, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
    except Exception:
        return []
    vistos = []
    for linea in out.splitlines():
        nombre = linea.split('","')[0].strip('"').lower()
        for hog in APP_HOGS:
            if hog in nombre and hog not in vistos:
                vistos.append(hog)
    return vistos

def diagnose_stream(cap, secs=1.0):
    n = 0
    brillo = 0.0
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < secs:
        ok, f = cap.read()
        if ok and f is not None:
            n += 1
            brillo = float(f.mean())
    dt = max(1e-6, time.perf_counter() - t0)
    return n / dt, brillo

def open_camera(cam_id=0, width=960, height=720, verbose=True):
    backends = []
    for name, val in (("DSHOW", "CAP_DSHOW"), ("MSMF", "CAP_MSMF")):
        if hasattr(cv2, val):
            backends.append((name, getattr(cv2, val)))
    backends.append(("por defecto", None))

    intentos = []
    for bname, b in backends:
        intentos.append((bname, b, width, height, True, 60))
        intentos.append((bname, b, width, height, False, 0))
        intentos.append((bname, b, 640, 480, False, 0))
        intentos.append((bname, b, 0, 0, False, 0))

    for bname, b, w, h, mjpg, fps in intentos:
        cap, frame = _try_open(cam_id, b, w, h, mjpg, fps)
        if cap is not None:
            hh, ww = frame.shape[:2]
            desc = "{} · {}x{}{}".format(bname, ww, hh, " · MJPG" if mjpg else "")
            if verbose:
                print("Camara {} abierta: {}".format(cam_id, desc))
                if (w and (ww != w or hh != h)):
                    print("  (se pidio {}x{}, la camara entrego {}x{})".format(w, h, ww, hh))
                fps_real, brillo = diagnose_stream(cap)
                print("  ritmo sostenido {:.1f} fps · brillo medio {:.1f}/255".format(
                    fps_real, brillo))
                if brillo < 1.0 or fps_real < 5.0:
                    hogs = camera_hogs()
                    print()
                    print("  *** LA CAMARA ENTREGA IMAGEN NEGRA / CONGELADA ***")
                    if hogs:
                        print("  Hay otra app usando la camara: " + ", ".join(hogs))
                        print("  Cierrala del todo (no basta con minimizarla) y vuelve a"
                              " ejecutar.")
                    else:
                        print("  Revisa: tapa fisica de la webcam cerrada, o")
                        print("  Configuracion > Privacidad > Camara.")
                    print()
            return cap, frame, desc
        if verbose:
            print("  no funciono: {} {}x{}{}".format(
                bname, w or "auto", h or "", " MJPG" if mjpg else ""))
    return None, None, ""

class CameraThread(threading.Thread):

    def __init__(self, cam_id=0, width=960, height=720, mirror=True, verbose=True):
        super().__init__(daemon=True)
        self.slot = Slot()
        self.mirror = mirror
        self.stopped = threading.Event()
        self.fps = 0.0

        cap, probe, desc = open_camera(cam_id, width, height, verbose)
        if cap is None:
            raise RuntimeError(
                "No se pudo abrir la camara {}.\n"
                "  - cierra Zoom/Teams/Camara de Windows y cualquier python previo\n"
                "  - revisa Privacidad > Camara en Windows\n"
                "  - prueba otro indice:  python run.py 1".format(cam_id))
        self.cap = cap
        self.desc = desc
        self.height, self.width = probe.shape[:2]
        self._publish(probe)

    def _publish(self, bgr):
        if self.mirror:
            bgr = cv2.flip(bgr, 1)
        self.slot.put(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

    def run(self):
        last = time.perf_counter()
        fallos = 0
        primeros = 0
        while not self.stopped.is_set():
            ok, bgr = self.cap.read()
            if not ok or bgr is None:
                fallos += 1
                if fallos > 300:
                    print("La camara dejo de entregar cuadros.")
                    break
                time.sleep(0.002)
                continue
            fallos = 0
            self._publish(bgr)
            now = time.perf_counter()
            dt = now - last
            last = now
            if dt <= 1e-6:
                continue

            primeros += 1
            if primeros <= 3:
                self.fps = 1.0 / dt
            else:
                self.fps = 0.9 * self.fps + 0.1 / dt

    def stop(self):
        self.stopped.set()
        self.join(timeout=1.0)
        self.cap.release()

class TrackerThread(threading.Thread):

    def __init__(self, name, factory, source: Slot):
        super().__init__(daemon=True, name=name)
        self.factory = factory
        self.source = source
        self.out = Slot()
        self.stopped = threading.Event()
        self.ms = 0.0
        self.hz = 0.0
        self._t0 = time.perf_counter()

    def run(self):
        det = self.factory()
        last_seq = -1
        last_tick = time.perf_counter()
        while not self.stopped.is_set():
            rgb, stamp, seq = self.source.get()
            if rgb is None or seq == last_seq:
                time.sleep(0.001)
                continue
            last_seq = seq
            ts_ms = int((stamp - self._t0) * 1000)
            t0 = time.perf_counter()
            try:
                res = det(rgb, ts_ms)
            except Exception:
                continue
            dt = time.perf_counter() - t0
            self.ms = 0.9 * self.ms + 0.1 * dt * 1000

            self.out.put(res, stamp)
            now = time.perf_counter()
            step = now - last_tick
            last_tick = now
            if step > 1e-6:
                self.hz = 0.9 * self.hz + 0.1 / step

    def stop(self):
        self.stopped.set()
        self.join(timeout=1.0)

class Predictor:

    def __init__(self, max_step=90.0, smooth=0.55):
        self.p0 = self.p1 = None
        self.t0 = self.t1 = 0.0
        self.vel = None
        self.max_step = max_step
        self.smooth = smooth

    def push(self, pts: np.ndarray, stamp: float):
        if pts is None:
            return
        if self.p1 is not None and stamp > self.t1 + 1e-5:
            v = (pts - self.p1) / (stamp - self.t1)
            self.vel = v if self.vel is None else \
                self.smooth * self.vel + (1.0 - self.smooth) * v
        self.p0, self.t0 = self.p1, self.t1
        self.p1, self.t1 = pts.copy(), stamp

    def get(self, now: float, lead: float = 0.0) -> np.ndarray | None:
        if self.p1 is None:
            return None
        if self.vel is None:
            return self.p1
        ahead = (now - self.t1) + lead
        ahead = float(np.clip(ahead, 0.0, 0.12))
        step = self.vel * ahead
        n = np.linalg.norm(step, axis=-1, keepdims=True)
        scale = np.minimum(1.0, self.max_step / np.maximum(n, 1e-6))
        return (self.p1 + step * scale).astype(np.float32)

    def reset(self):
        self.p0 = self.p1 = self.vel = None
