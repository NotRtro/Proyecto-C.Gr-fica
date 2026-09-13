from __future__ import annotations

import numpy as np
import moderngl

from .hands import BONES, HandFeatures

PALM_WIDTH_CM = 8.2

def _torus(R, r, nu=48, nv=12):
    u = np.linspace(0, 2 * np.pi, nu, endpoint=False)
    v = np.linspace(0, 2 * np.pi, nv, endpoint=False)
    U, V = np.meshgrid(u, v, indexing="ij")
    cx = (R + r * np.cos(V)) * np.cos(U)
    cy = (R + r * np.cos(V)) * np.sin(U)
    cz = r * np.sin(V)
    P = np.stack([cx, cy, cz], -1)
    N = np.stack([np.cos(V) * np.cos(U), np.cos(V) * np.sin(U), np.sin(V)], -1)
    tris = []
    for i in range(nu):
        for j in range(nv):
            a = (i, j)
            b = ((i + 1) % nu, j)
            c = ((i + 1) % nu, (j + 1) % nv)
            d = (i, (j + 1) % nv)
            tris += [(a, b, c), (a, c, d)]
    idx = np.array([[p[0] * nv + p[1] for p in t] for t in tris])
    return P.reshape(-1, 3), N.reshape(-1, 3), idx

def _icosphere(radius=1.0, subdiv=2):
    t = (1 + 5 ** 0.5) / 2
    v = np.array([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
                  [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                  [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]], float)
    f = np.array([[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
                  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
                  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]])
    for _ in range(subdiv):
        nf = []
        cache = {}
        vl = list(v)

        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                cache[k] = len(vl)
                vl.append((vl[a] + vl[b]) / 2)
            return cache[k]

        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]
        v = np.array(vl)
        f = np.array(nf)
    n = v / np.linalg.norm(v, axis=1, keepdims=True)
    return n * radius, n, f

def _transform(P, N, offset=(0, 0, 0), scale=1.0, rot_y=0.0):
    c, s = np.cos(rot_y), np.sin(rot_y)
    R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return (P * scale) @ R.T + np.array(offset), N @ R.T

def make_reactor():
    parts = []
    P, N, F = _icosphere(0.9, 1)
    parts.append(("nucleo", P, N, F, np.array([0.0, 0.0, 0.0])))

    P, N, F = _torus(1.7, 0.16, 30, 7)
    parts.append(("anillo interior", P, N, F, np.array([0.0, 0.0, 1.0])))

    P, N, F = _torus(2.6, 0.20, 36, 7)
    parts.append(("anillo exterior", P, N, F, np.array([0.0, 0.0, -1.0])))

    coils_P, coils_N, coils_F = [], [], []
    base = 0
    for k in range(8):
        a = k * 2 * np.pi / 8
        P, N, F = _torus(0.34, 0.11, 12, 6)
        off = (np.cos(a) * 2.15, np.sin(a) * 2.15, 0.0)
        P, N = _transform(P, N, off, 1.0, a)
        coils_P.append(P)
        coils_N.append(N)
        coils_F.append(F + base)
        base += len(P)
    parts.append(("bobinas", np.vstack(coils_P), np.vstack(coils_N),
                  np.vstack(coils_F), np.array([0.0, 1.0, 0.0])))

    P, N, F = _torus(3.3, 0.10, 40, 6)
    parts.append(("carcasa", P, N, F, np.array([0.0, -1.0, 0.0])))
    return parts

_HOLO_VS = """
#version 330
in vec3 in_pos;
in vec3 in_normal;
in vec3 in_bary;
in vec3 in_pivot;
uniform mat4 u_mvp;
uniform mat4 u_model;
uniform float u_explode;
out vec3 v_normal;
out vec3 v_bary;
out vec3 v_local;
out vec3 v_view;
void main(){
    vec3 p = in_pos + in_pivot * u_explode;
    vec4 world = u_model * vec4(p, 1.0);
    v_normal = mat3(u_model) * in_normal;
    v_bary = in_bary;
    v_local = p;
    v_view  = -world.xyz;
    gl_Position = u_mvp * vec4(p, 1.0);
}
"""

_HOLO_FS = """
#version 330
in vec3 v_normal;
in vec3 v_bary;
in vec3 v_local;
in vec3 v_view;
out vec4 f_color;
uniform float u_time;
uniform vec3  u_tint;
uniform float u_alpha;
uniform float u_wire;
uniform float u_dissolve;
uniform float u_glow;

float hash31(vec3 p){
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
                   mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                   mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){
    float a = 0.5, s = 0.0;
    for(int i = 0; i < 4; ++i){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return s;
}

void main(){
    vec3 N = normalize(v_normal);
    vec3 V = normalize(v_view);
    float fres = pow(1.0 - abs(dot(N, V)), 2.2);

    float scan = pow(0.5 + 0.5 * sin(v_local.y * 26.0 - u_time * 5.0), 3.0);

    float e = min(min(v_bary.x, v_bary.y), v_bary.z);
    float wire = 1.0 - smoothstep(0.0, 0.035, e);

    float r = length(v_local);
    float core = 0.0;
    if(r < 1.35){
        float n = fbm(v_local * 2.6 + vec3(0.0, 0.0, u_time * 0.55));
        n += 0.5 * fbm(v_local * 6.0 - vec3(u_time * 0.9, 0.0, 0.0));
        core = smoothstep(0.55, 1.05, n) * (1.0 - smoothstep(0.7, 1.35, r));
    }

    float veins = smoothstep(0.62, 0.95, fbm(v_local * 3.1 + vec3(u_time * 0.7, 0.0, 0.0)));

    float dn = fbm(v_local * 2.2 + 11.0);
    float cut = u_dissolve * 1.25;
    if(dn < cut - 0.10) discard;
    float edge = 1.0 - smoothstep(cut - 0.10, cut + 0.06, dn);

    vec3 hot = vec3(1.0, 0.72, 0.30);
    vec3 col = u_tint * (0.35 + 2.2 * fres + 0.45 * scan + 0.9 * veins)
             + vec3(0.70, 0.95, 1.0) * wire * u_wire * 1.4
             + hot * core * 2.6
             + hot * edge * 4.0;

    float a = 0.30 + 0.95 * fres + 0.22 * scan + 0.85 * wire * u_wire
            + 0.85 * core + 0.5 * veins + edge;
    a = clamp(a * u_alpha, 0.0, 1.0);
    f_color = vec4(col * u_glow, a);
}
"""

_DEPTH_VS = """
#version 330
in vec3 in_pos;
uniform mat4 u_mvp;
void main(){ gl_Position = u_mvp * vec4(in_pos, 1.0); }
"""
_DEPTH_FS = """
#version 330
void main(){ }
"""

_PROXY_FS = """
#version 330
out vec4 f_color;
uniform vec3 u_tint;
void main(){ f_color = vec4(u_tint * 0.5, 0.5); }
"""

def _expand(P, N, F, pivot):
    v = P[F.reshape(-1)]
    n = N[F.reshape(-1)]
    m = len(F)
    bary = np.tile(np.eye(3, dtype="f4"), (m, 1))
    piv = np.tile(pivot.astype("f4"), (len(v), 1))
    return (v.astype("f4"), n.astype("f4"), bary, piv)

class Hologram:

    def __init__(self, ctx: moderngl.Context):
        self.ctx = ctx
        self.prog = ctx.program(vertex_shader=_HOLO_VS, fragment_shader=_HOLO_FS)
        self.parts = make_reactor()
        self.part_names = [p[0] for p in self.parts]

        V, Nn, B, Pv = [], [], [], []
        self.ranges = []
        start = 0
        for name, P, N, F, pivot in self.parts:
            v, n, b, p = _expand(P, N, F, pivot)
            V.append(v); Nn.append(n); B.append(b); Pv.append(p)
            self.ranges.append((start, len(v)))
            start += len(v)
        self.vbo = ctx.buffer(np.hstack([np.vstack(V), np.vstack(Nn),
                                         np.vstack(B), np.vstack(Pv)]).astype("f4").tobytes())
        self.n_verts = start
        self.vao = ctx.vertex_array(self.prog, [
            (self.vbo, "3f 3f 3f 3f", "in_pos", "in_normal", "in_bary", "in_pivot"),
        ])

    def render(self, mvp, model, *, time=0.0, explode=0.0,
               tint=(0.25, 0.85, 1.0), alpha=1.0, wire=1.0,
               dissolve=0.0, glow=1.7):
        p = self.prog
        p["u_mvp"].write(np.ascontiguousarray(mvp.T, dtype="f4").tobytes())
        p["u_model"].write(np.ascontiguousarray(model.T, dtype="f4").tobytes())
        p["u_time"].value = float(time)
        p["u_explode"].value = float(explode)
        p["u_tint"].value = tuple(tint)
        p["u_alpha"].value = float(alpha)
        p["u_wire"].value = float(wire)
        p["u_dissolve"].value = float(dissolve)
        p["u_glow"].value = float(glow)
        self.vao.render(mode=moderngl.TRIANGLES, vertices=self.n_verts)

def hand_depth_cm(f: HandFeatures, fx: float) -> float:
    return float(fx * PALM_WIDTH_CM / max(f.width_px, 1e-3))

def unproject(pts_px: np.ndarray, base_z_cm: float, fx, fy, cx, cy) -> np.ndarray:
    u, v, zrel = pts_px[:, 0], pts_px[:, 1], pts_px[:, 2]
    z = base_z_cm + zrel * (base_z_cm / fx)
    z = np.maximum(z, 1.0)
    X = (u - cx) * z / fx
    Y = -(v - cy) * z / fy
    return np.stack([X, Y, -z], axis=1).astype("f4")

class HandOcclusion:

    MAX_TRIS = 4096

    def __init__(self, ctx: moderngl.Context):
        self.ctx = ctx
        self.depth_prog = ctx.program(vertex_shader=_DEPTH_VS, fragment_shader=_DEPTH_FS)
        self.show_prog = ctx.program(vertex_shader=_DEPTH_VS, fragment_shader=_PROXY_FS)
        self.vbo = ctx.buffer(reserve=self.MAX_TRIS * 3 * 3 * 4, dynamic=True)
        self.vao_depth = ctx.vertex_array(self.depth_prog, [(self.vbo, "3f", "in_pos")])
        self.vao_show = ctx.vertex_array(self.show_prog, [(self.vbo, "3f", "in_pos")])
        self.n_verts = 0

    @staticmethod
    def build_mesh(p3d: np.ndarray, radius_cm: float) -> np.ndarray:
        tris = []
        view = np.array([0.0, 0.0, 1.0])
        for a, b in BONES:
            pa, pb = p3d[a], p3d[b]
            d = pb - pa
            ln = np.linalg.norm(d)
            if ln < 1e-4:
                continue
            d = d / ln
            side = np.cross(d, view)
            sn = np.linalg.norm(side)
            if sn < 1e-4:
                side = np.array([1.0, 0.0, 0.0])
            else:
                side = side / sn
            o = side * radius_cm
            q = [pa - o, pa + o, pb + o, pb - o]
            tris += [q[0], q[1], q[2], q[0], q[2], q[3]]
        r = radius_cm * 1.25
        for i in range(len(p3d)):
            c = p3d[i]
            q = [c + np.array([-r, -r, 0]), c + np.array([r, -r, 0]),
                 c + np.array([r, r, 0]), c + np.array([-r, r, 0])]
            tris += [q[0], q[1], q[2], q[0], q[2], q[3]]
        return np.array(tris, dtype="f4")

    def update(self, f: HandFeatures, camera) -> float:
        if not f.present:
            self.n_verts = 0
            return 0.0
        K = camera.intrinsics()
        fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]
        z = hand_depth_cm(f, fx)
        p3d = unproject(f.pts_px, z, fx, fy, cx, cy)
        radius = PALM_WIDTH_CM * 0.16
        mesh = self.build_mesh(p3d, radius)
        n = min(len(mesh), self.MAX_TRIS * 3)
        self.vbo.write(np.ascontiguousarray(mesh[:n]).tobytes())
        self.n_verts = n
        return z

    def render_depth(self, mvp):
        if self.n_verts == 0:
            return
        self.depth_prog["u_mvp"].write(np.ascontiguousarray(mvp.T, dtype="f4").tobytes())
        self.ctx.enable(moderngl.DEPTH_TEST)

        self.ctx.fbo.color_mask = (False, False, False, False)
        self.vao_depth.render(mode=moderngl.TRIANGLES, vertices=self.n_verts)
        self.ctx.fbo.color_mask = (True, True, True, True)

    def render_visible(self, mvp, tint=(1.0, 0.45, 0.15)):
        if self.n_verts == 0:
            return
        self.show_prog["u_mvp"].write(np.ascontiguousarray(mvp.T, dtype="f4").tobytes())
        self.show_prog["u_tint"].value = tuple(tint)
        self.vao_show.render(mode=moderngl.TRIANGLES, vertices=self.n_verts)
