from __future__ import annotations

import cv2
import numpy as np

from .hands import BONES

COLOR_GESTO = {
    "reposo":  (150, 150, 150),
    "palma":   (90, 230, 120),
    "puno":    (80, 120, 255),
    "pinza":   (255, 200, 60),
    "apuntar": (255, 140, 220),
    "abrir":   (120, 240, 255),
}

def ajustar_ventana(img, box_w, box_h):
    h, w = img.shape[:2]
    if box_w < 8 or box_h < 8:
        return img
    k = min(box_w / float(w), box_h / float(h))
    nw, nh = max(1, int(round(w * k))), max(1, int(round(h * k)))
    lienzo = np.zeros((box_h, box_w, 3), np.uint8)
    x0, y0 = (box_w - nw) // 2, (box_h - nh) // 2
    lienzo[y0:y0 + nh, x0:x0 + nw] = cv2.resize(
        img, (nw, nh), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR)
    return lienzo

def dibujar(img, scene, hands, fps, mostrar_geo=True, pt_scale=1.0, stats=""):
    h, w = img.shape[:2]
    F = cv2.FONT_HERSHEY_SIMPLEX
    s = h / 720.0
    grosor = max(1, int(round(1.4 * s)))

    def txt(t, x, y, sc=0.5, col=(235, 245, 255), th=None):
        th = th or grosor
        org = (int(x * s), int(y * s))
        cv2.putText(img, t, org, F, sc * s, (0, 0, 0), th + max(2, int(2 * s)),
                    cv2.LINE_AA)
        cv2.putText(img, t, org, F, sc * s, col, th, cv2.LINE_AA)

    cv2.rectangle(img, (0, 0), (w, int(34 * s)), (18, 22, 30), -1)
    txt("OBJETO 3D", 12, 23, 0.56, (255, 255, 255))
    txt("{:5.1f} fps".format(fps), 132, 23, 0.5, (170, 200, 220))
    txt("OCLUSION", 240, 23, 0.5)
    txt("ON" if scene.occlusion_on else "OFF", 344, 23, 0.5,
        (120, 240, 200) if scene.occlusion_on else (90, 110, 255))
    txt("mano {:3.0f} cm   objeto {:3.0f} cm".format(
        scene.hand_depth, abs(float(scene.pos[2]))), 400, 23, 0.46, (170, 190, 210))

    cv2.rectangle(img, (0, int(658 * s)), (w, h), (14, 18, 25), -1)
    if stats:
        txt(stats, 12, 674, 0.40, (130, 220, 255))
    txt("escala {:.1f}x   explotado {:.2f}   disolucion {:.2f}   post {}".format(
        scale_of(scene), scene.explode, scene.dissolve,
        "ON" if scene.post.enabled else "OFF"), 12, 694, 0.40, (170, 200, 190))
    txt("[O]oclusion [P]proxy [G]geometria [X]post [D]disolver [E]explotar "
        "[T]prediccion [R]reiniciar [Q]salir", 12, 712, 0.38, (150, 170, 190))

    if not hands:
        txt("sin manos en cuadro", 12, 60, 0.58, (120, 140, 160))
        return

    mano = hands[0]
    g = mano.gesture
    col = COLOR_GESTO.get(g, (200, 200, 200))
    p0 = (int(10 * s), int(46 * s))
    p1 = (int(268 * s), int(84 * s))
    cv2.rectangle(img, p0, p1, (18, 22, 30), -1)
    cv2.rectangle(img, p0, p1, col, max(1, int(2 * s)))
    txt("GESTO: " + g.upper(), 22, 72, 0.7, col, grosor + 1)

    if not mostrar_geo:
        return

    p = mano.pts_px[:, :2] * pt_scale
    for a, b in BONES:
        cv2.line(img, tuple(p[a].astype(int)), tuple(p[b].astype(int)),
                 (60, 200, 220), max(1, int(1.5 * s)), cv2.LINE_AA)
    for q in p:
        cv2.circle(img, tuple(q.astype(int)), max(2, int(3 * s)),
                   (255, 255, 255), -1, cv2.LINE_AA)

    y0 = 108
    cv2.rectangle(img, (int(10 * s), int((y0 - 18) * s)),
                  (int(268 * s), int((y0 + 128) * s)), (18, 22, 30), -1)
    txt("curvatura por dedo", 20, y0 - 4, 0.42, (150, 170, 190))
    for i, (nombre, c) in enumerate(mano.curls.items()):
        yy = y0 + 14 + i * 17
        txt(nombre[:7], 20, yy + 4, 0.42)
        cv2.rectangle(img, (int(86 * s), int((yy - 6) * s)),
                      (int(210 * s), int((yy + 5) * s)), (45, 52, 64), -1)
        cv2.rectangle(img, (int(86 * s), int((yy - 6) * s)),
                      (int((86 + 124 * c) * s), int((yy + 5) * s)), (70, 210, 230), -1)
        txt("{:.2f}".format(c), 216, yy + 4, 0.38, (170, 190, 210))
    txt("pinza {:.2f}  apertura {:.2f}  separacion {:.2f}".format(
        mano.pinch, mano.openness, mano.spread), 20, y0 + 108, 0.42, (200, 220, 235))

def scale_of(scene):
    return float(scene.scale)
