from __future__ import annotations

import os
import sys
import time

import cv2
import numpy as np
import moderngl

from core import hud
from core.hands import extract_features, GestureMachine, OneEuro
from core.realtime import CameraThread, TrackerThread, Predictor
from core.scene import Scene

RAIZ = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(RAIZ, "assets")

def _resolucion_pedida(por_defecto=(640, 480)):
    valor = os.environ.get("OBJ3D_CAM", "")
    if "x" in valor:
        try:
            ancho, alto = valor.lower().split("x")
            return int(ancho), int(alto)
        except ValueError:
            pass
    return por_defecto

W, H = _resolucion_pedida()

def crear_detector_manos(w, h):
    import mediapipe as mp
    from mediapipe.tasks import python as mpp
    from mediapipe.tasks.python import vision as mpv

    opts = mpv.HandLandmarkerOptions(
        base_options=mpp.BaseOptions(
            model_asset_path=os.path.join(ASSETS, "hand_landmarker.task")),
        running_mode=mpv.RunningMode.VIDEO, num_hands=2,
        min_hand_detection_confidence=0.5, min_tracking_confidence=0.5)
    det = mpv.HandLandmarker.create_from_options(opts)
    escala = np.array([w, h, w], dtype=np.float32)

    def run(rgb, ts_ms):
        img = mp.Image(image_format=mp.ImageFormat.SRGB,
                       data=np.ascontiguousarray(rgb))
        r = det.detect_for_video(img, ts_ms)
        salida = []
        for i, lm in enumerate(r.hand_landmarks):
            pts = np.array([[q.x, q.y, q.z] for q in lm], dtype=np.float32) * escala
            lado = r.handedness[i][0].category_name if r.handedness else ""
            salida.append((pts, lado))
        return salida
    return run

def main():
    cam_id = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    cam = CameraThread(cam_id, W, H, mirror=True)
    w, h = cam.width, cam.height
    cam.start()

    ctx = moderngl.create_standalone_context()
    print("GL:", ctx.info["GL_RENDERER"], ctx.info["GL_VERSION"])
    fbo = ctx.simple_framebuffer((w, h))
    fbo.use()

    scene = Scene(ctx, w, h)

    th_manos = TrackerThread("manos", lambda: crear_detector_manos(w, h), cam.slot)
    th_manos.start()

    disp_w = int(os.environ.get("OBJ3D_ANCHO", "0")) or int(min(1600, max(960, w)))
    disp_h = int(round(disp_w * h / w))
    pt_scale = disp_w / float(w)
    win = "OBJETO 3D - MOVIMIENTO"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, disp_w, disp_h)
    print("Camara {}x{} (proporcion {:.4f})  ->  ventana {}x{} (proporcion {:.4f})"
          .format(w, h, w / h, disp_w, disp_h, disp_w / disp_h))
    print("Listo.  O=oclusion P=proxy G=geometria X=post D=disolver "
          "E=explotar T=prediccion R=reiniciar Q=salir")

    try:
        _bucle(scene, ctx, fbo, cam, th_manos, w, h, disp_w, disp_h, pt_scale, win)
    finally:
        _limpiar(th_manos, cam)

def _limpiar(th_manos, cam):
    for t in (th_manos,):
        try:
            t.stop()
        except Exception:
            pass
    try:
        cam.stop()
    except Exception:
        pass
    cv2.destroyAllWindows()

def _bucle(scene, ctx, fbo, cam, th_manos, w, h, disp_w, disp_h, pt_scale, win):
    predictores = [Predictor(max_step=140.0), Predictor(max_step=140.0)]
    filtros = [OneEuro(min_cutoff=1.4, beta=0.6), OneEuro(min_cutoff=1.4, beta=0.6)]
    maquinas = [GestureMachine(), GestureMachine()]
    ultimo_stamp = -1.0

    prediccion = True
    adelanto_auto = True
    adelanto = 0.030
    sesgo = 1.0
    edad_media = 0.030

    mostrar_geo, mostrar_hud = True, True
    t0 = time.perf_counter()
    last = t0
    fps = 0.0
    ms_render = ms_read = 0.0

    while True:
        rgb, stamp, seq = cam.slot.get()
        if rgb is None:
            time.sleep(0.002)
            continue

        now = time.perf_counter()
        dt = max(1e-4, now - last)
        last = now
        fps = 0.9 * fps + 0.1 / dt

        res, res_stamp, _ = th_manos.out.get()
        if res is not None and res_stamp > ultimo_stamp:
            for i in range(2):
                if i < len(res):
                    predictores[i].push(res[i][0], res_stamp)
                else:
                    predictores[i].reset()
            ultimo_stamp = res_stamp
        if ultimo_stamp > 0:
            edad_media = 0.92 * edad_media + 0.08 * (now - ultimo_stamp)
        if adelanto_auto:
            adelanto = float(min(0.12, edad_media * sesgo))

        manos = []
        if res:
            for i in range(min(2, len(res))):
                pts = predictores[i].get(now, adelanto if prediccion else 0.0)
                if pts is None:
                    continue
                pts = filtros[i](pts, dt).astype(np.float32)
                f = extract_features(pts, res[i][1])
                maquinas[i].update(f)
                manos.append(f)

        scene.apply_gestures(manos, dt)
        scene.update(dt)
        t_r = time.perf_counter()
        scene.render(rgb, manos, now - t0, target_fbo=fbo)
        ctx.finish()
        ms_render = 0.9 * ms_render + 0.1 * (time.perf_counter() - t_r) * 1000

        t_b = time.perf_counter()
        buf = np.frombuffer(fbo.read(components=3), np.uint8).reshape(h, w, 3)
        out = cv2.cvtColor(np.flipud(buf), cv2.COLOR_RGB2BGR)
        ms_read = 0.9 * ms_read + 0.1 * (time.perf_counter() - t_b) * 1000

        if (disp_w, disp_h) != (w, h):
            out = cv2.resize(out, (disp_w, disp_h), interpolation=cv2.INTER_LINEAR)

        if mostrar_hud:
            edad = (now - ultimo_stamp) * 1000 if ultimo_stamp > 0 else 0.0
            stats = ("cam {:4.1f}Hz | manos {:4.1f}ms/{:4.1f}Hz | render {:4.1f}"
                     " | lectura {:4.1f} | edad {:4.1f}ms | pred {} {} {:3.0f}ms"
                     ).format(cam.fps, th_manos.ms, th_manos.hz, ms_render, ms_read,
                              edad, "ON" if prediccion else "OFF",
                              "auto" if adelanto_auto else "man", adelanto * 1000)
            hud.dibujar(out, scene, manos, fps, mostrar_geo, pt_scale, stats)

        try:
            _, _, ww, wh = cv2.getWindowImageRect(win)
        except cv2.error:
            ww = wh = 0
        if ww > 8 and wh > 8 and (ww, wh) != (disp_w, disp_h):
            out = hud.ajustar_ventana(out, ww, wh)
        cv2.imshow(win, out)

        try:
            if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
                break
        except cv2.error:
            break

        k = cv2.waitKey(1) & 0xFF
        if k in (ord("q"), 27):
            break
        elif k == ord("o"):
            scene.occlusion_on = not scene.occlusion_on
        elif k == ord("p"):
            scene.show_proxy = not scene.show_proxy
        elif k == ord("g"):
            mostrar_geo = not mostrar_geo
        elif k == ord("h"):
            mostrar_hud = not mostrar_hud
        elif k == ord("x"):
            scene.post.enabled = not scene.post.enabled
        elif k == ord("d"):
            scene.dissolve_target = 0.0 if scene.dissolve_target > 0.5 else 1.0
        elif k == ord("e"):
            scene.explode_target = 0.0 if scene.explode_target > 0.1 else 2.2
        elif k == ord("t"):
            prediccion = not prediccion
        elif k == ord("y"):
            adelanto_auto = not adelanto_auto
        elif k == ord(","):
            if adelanto_auto:
                sesgo = max(0.0, sesgo - 0.1)
            else:
                adelanto = max(0.0, adelanto - 0.005)
        elif k == ord("."):
            if adelanto_auto:
                sesgo = min(2.0, sesgo + 0.1)
            else:
                adelanto = min(0.12, adelanto + 0.005)
        elif k == ord("r"):
            scene.reset()

if __name__ == "__main__":
    main()
