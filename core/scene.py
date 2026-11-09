from __future__ import annotations

import numpy as np
import moderngl

from .camera import PinholeCamera
from .hands import HandFeatures
from .hologram import Hologram, HandOcclusion, hand_depth_cm
from .postfx import PostFX

OBJETO_PROFUNDIDAD_CM = 46.0

_BG_VS = """
#version 330
in vec2 in_pos;
out vec2 v_uv;
void main(){ v_uv = in_pos*0.5+0.5; gl_Position = vec4(in_pos,0.0,1.0); }
"""
_BG_FS = """
#version 330
in vec2 v_uv;
out vec4 f_color;
uniform sampler2D u_tex;
void main(){ f_color = vec4(texture(u_tex, vec2(v_uv.x, 1.0-v_uv.y)).rgb, 1.0); }
"""

class Scene:

    def __init__(self, ctx, width, height):
        self.ctx = ctx
        self.size = (width, height)
        self.camera = PinholeCamera(width, height)
        self.objeto = Hologram(ctx)
        self.occ = HandOcclusion(ctx)
        self.post = PostFX(ctx, width, height)

        self.bg_prog = ctx.program(vertex_shader=_BG_VS, fragment_shader=_BG_FS)
        quad = np.array([-1, -1, 3, -1, -1, 3], dtype="f4")
        self.bg_vao = ctx.vertex_array(
            self.bg_prog, [(ctx.buffer(quad.tobytes()), "2f", "in_pos")])
        self.bg_tex = ctx.texture((width, height), 3)
        self.bg_tex.filter = (moderngl.LINEAR, moderngl.LINEAR)

        self.pos = np.array([0.0, 0.0, -OBJETO_PROFUNDIDAD_CM], dtype="f4")
        self.home = self.pos.copy()
        self.scale = 3.0
        self.yaw = 0.0
        self.pitch = 0.0
        self.spin = 0.55
        self.explode = 0.0
        self.explode_target = 0.0
        self.dissolve = 0.0
        self.dissolve_target = 0.0

        self.occlusion_on = True
        self.show_proxy = False

        self._grab_ref = None
        self._scale_ref = None
        self.hand_depth = 0.0

    def apply_gestures(self, hands: list[HandFeatures], dt: float):
        K = self.camera.intrinsics()
        fx, cx, cy = K[0, 0], K[0, 2], K[1, 2]
        primary = hands[0] if hands else None

        if len(hands) == 2 and all(h.gesture == "pinza" for h in hands):
            d = float(np.linalg.norm(hands[0].center[:2] - hands[1].center[:2]))
            if self._scale_ref is None:
                self._scale_ref = (d, self.scale)
            d0, s0 = self._scale_ref
            self.scale = float(np.clip(s0 * (d / max(d0, 1e-3)), 1.0, 9.0))
            self._grab_ref = None
            return
        self._scale_ref = None

        if primary is None or not primary.present:
            self._grab_ref = None
            return

        g = primary.gesture
        self.hand_depth = hand_depth_cm(primary, fx)

        if g == "palma":
            self.dissolve_target = 0.0

        if g == "abrir":
            self.explode_target = 2.2
        elif g in ("palma", "puno"):
            self.explode_target = 0.0

        if g == "pinza":

            u, v = primary.center[0], primary.center[1]
            z = self.hand_depth
            target = np.array([(u - cx) * z / fx, -(v - cy) * z / fx, -z], dtype="f4")
            if self._grab_ref is None:
                self._grab_ref = target - self.pos
            self.pos += (target - self._grab_ref - self.pos) * min(1.0, 9.0 * dt)
        else:
            self._grab_ref = None

        if g == "apuntar":

            self.yaw += (primary.pts_px[8][0] / self.size[0] - 0.5) * 3.0 * dt

    def update(self, dt: float):
        self.yaw += self.spin * dt
        self.explode += (self.explode_target - self.explode) * min(1.0, 5.0 * dt)
        self.dissolve += (self.dissolve_target - self.dissolve) * min(1.0, 3.2 * dt)

    def reset(self):
        self.pos = self.home.copy()
        self.scale, self.yaw, self.pitch = 3.0, 0.0, 0.0
        self.explode_target = 0.0
        self.dissolve_target = 0.0

    def model_matrix(self):
        cy, sy = np.cos(self.yaw), np.sin(self.yaw)
        cp, sp = np.cos(self.pitch), np.sin(self.pitch)
        Ry = np.array([[cy, 0, sy, 0], [0, 1, 0, 0], [-sy, 0, cy, 0], [0, 0, 0, 1]], "f4")
        Rx = np.array([[1, 0, 0, 0], [0, cp, -sp, 0], [0, sp, cp, 0], [0, 0, 0, 1]], "f4")
        S = np.diag([self.scale, self.scale, self.scale, 1.0]).astype("f4")
        T = np.eye(4, dtype="f4")
        T[:3, 3] = self.pos
        return (T @ Ry @ Rx @ S).astype("f4")

    def render(self, rgb_frame, hands, t, target_fbo=None):
        ctx = self.ctx
        w, h = self.size
        self.post.scene_fbo.use()
        ctx.viewport = (0, 0, w, h)
        ctx.clear(0.0, 0.0, 0.0, 1.0, depth=1.0)

        ctx.disable(moderngl.DEPTH_TEST)
        ctx.fbo.depth_mask = True
        self.bg_tex.write(np.ascontiguousarray(rgb_frame).tobytes())
        self.bg_tex.use(0)
        self.bg_prog["u_tex"].value = 0
        self.bg_vao.render(mode=moderngl.TRIANGLES, vertices=3)

        proj = self.camera.projection_matrix()
        model = self.model_matrix()
        mvp = (proj @ model).astype("f4")

        primary = hands[0] if hands else None
        if primary is not None and primary.present:
            self.hand_depth = self.occ.update(primary, self.camera)
            if self.occlusion_on:
                ctx.enable(moderngl.DEPTH_TEST)
                ctx.fbo.depth_mask = True
                self.occ.render_depth(proj)

        ctx.enable(moderngl.DEPTH_TEST)
        ctx.enable(moderngl.BLEND)
        ctx.blend_func = (moderngl.ONE, moderngl.ONE_MINUS_SRC_ALPHA)
        ctx.fbo.depth_mask = False
        self.objeto.render(mvp, model, time=t, explode=self.explode,
                           dissolve=self.dissolve, glow=1.8)
        ctx.fbo.depth_mask = True
        ctx.blend_func = (moderngl.SRC_ALPHA, moderngl.ONE_MINUS_SRC_ALPHA)

        if self.show_proxy and primary is not None and primary.present:
            ctx.disable(moderngl.DEPTH_TEST)
            self.occ.render_visible(proj)
        ctx.disable(moderngl.DEPTH_TEST)

        if target_fbo is not None:
            self.post.render(target_fbo, t)
