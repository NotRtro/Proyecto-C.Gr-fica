from __future__ import annotations

import numpy as np
import moderngl

_QUAD_VS = """
#version 330
in vec2 in_pos;
out vec2 v_uv;
void main(){ v_uv = in_pos * 0.5 + 0.5; gl_Position = vec4(in_pos, 0.0, 1.0); }
"""

_BRIGHT_FS = """
#version 330
in vec2 v_uv;
out vec4 f_color;
uniform sampler2D u_src;
uniform float u_threshold;
uniform float u_knee;
void main(){
    vec3 c = texture(u_src, v_uv).rgb;
    float l = max(max(c.r, c.g), c.b);
    float k = max(u_knee, 1e-4);
    float soft = clamp((l - u_threshold + k) / (2.0 * k), 0.0, 1.0);
    float w = max(l - u_threshold, soft * soft * k) / max(l, 1e-4);
    f_color = vec4(c * clamp(w, 0.0, 1.0), 1.0);
}
"""

_BLUR_FS = """
#version 330
in vec2 v_uv;
out vec4 f_color;
uniform sampler2D u_src;
uniform vec2 u_dir;
void main(){
    float w[5] = float[](0.227027, 0.194594, 0.121621, 0.054054, 0.016216);
    vec3 c = texture(u_src, v_uv).rgb * w[0];
    for(int i = 1; i < 5; ++i){
        vec2 o = u_dir * float(i) * 1.35;
        c += texture(u_src, v_uv + o).rgb * w[i];
        c += texture(u_src, v_uv - o).rgb * w[i];
    }
    f_color = vec4(c, 1.0);
}
"""

_UP_FS = """
#version 330
in vec2 v_uv;
out vec4 f_color;
uniform sampler2D u_src;
uniform sampler2D u_add;
uniform float u_mix;
void main(){
    f_color = vec4(texture(u_src, v_uv).rgb + texture(u_add, v_uv).rgb * u_mix, 1.0);
}
"""

_COMPOSITE_FS = """
#version 330
in vec2 v_uv;
out vec4 f_color;

uniform sampler2D u_scene;
uniform sampler2D u_b0;
uniform sampler2D u_b1;
uniform sampler2D u_b2;
uniform sampler2D u_b3;
uniform float u_bloom_amt;
uniform float u_aberration;
uniform float u_vignette;
uniform float u_grain;
uniform float u_scanline;
uniform float u_exposure;
uniform float u_time;
uniform vec2  u_res;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 aces(vec3 x){
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 bloom_at(vec2 uv){
    return texture(u_b0, uv).rgb * 0.42
         + texture(u_b1, uv).rgb * 0.28
         + texture(u_b2, uv).rgb * 0.19
         + texture(u_b3, uv).rgb * 0.11;
}

void main(){
    vec2 uv = v_uv;
    vec2 d = uv - 0.5;
    float r2 = dot(d, d);

    float k = u_aberration * r2;
    vec3 col;
    col.r = texture(u_scene, uv - d * k).r;
    col.g = texture(u_scene, uv).g;
    col.b = texture(u_scene, uv + d * k).b;

    col += bloom_at(uv) * u_bloom_amt;
    col *= u_exposure;
    col = aces(col);

    col *= mix(1.0, smoothstep(0.95, 0.10, r2 * 1.9), u_vignette);

    float sl = 0.5 + 0.5 * sin(uv.y * u_res.y * 1.6 + u_time * 2.0);
    col *= mix(1.0, 0.97 + 0.03 * sl, u_scanline);

    float g = hash(uv * u_res + fract(u_time) * 100.0) - 0.5;
    col += g * u_grain;

    f_color = vec4(col, 1.0);
}
"""

def _fbo(ctx, size, dtype="f2"):
    tex = ctx.texture(size, 4, dtype=dtype)
    tex.filter = (moderngl.LINEAR, moderngl.LINEAR)
    tex.repeat_x = tex.repeat_y = False
    return ctx.framebuffer(color_attachments=[tex]), tex

class PostFX:

    LEVELS = 4

    def __init__(self, ctx: moderngl.Context, width: int, height: int):
        self.ctx = ctx
        self.size = (width, height)

        quad = np.array([-1, -1, 3, -1, -1, 3], dtype="f4")
        self._quad_vbo = ctx.buffer(quad.tobytes())

        self.p_bright = self._prog(_BRIGHT_FS)
        self.p_blur = self._prog(_BLUR_FS)
        self.p_up = self._prog(_UP_FS)
        self.p_comp = self._prog(_COMPOSITE_FS)

        self.scene_tex = ctx.texture((width, height), 4, dtype="f2")
        self.scene_tex.filter = (moderngl.LINEAR, moderngl.LINEAR)
        self.depth = ctx.depth_renderbuffer((width, height))
        self.scene_fbo = ctx.framebuffer(color_attachments=[self.scene_tex],
                                         depth_attachment=self.depth)

        self.levels = []
        w, h = width // 2, height // 2
        for _ in range(self.LEVELS):
            w, h = max(w, 4), max(h, 4)
            a, at = _fbo(ctx, (w, h))
            b, bt = _fbo(ctx, (w, h))
            self.levels.append(((a, at), (b, bt), (w, h)))
            w, h = w // 2, h // 2

        self.threshold = 1.02
        self.knee = 0.25
        self.bloom = 1.0
        self.aberration = 0.012
        self.vignette = 0.35
        self.grain = 0.018
        self.scanline = 0.15
        self.exposure = 1.0
        self.enabled = True

    def _prog(self, fs):
        return self.ctx.program(vertex_shader=_QUAD_VS, fragment_shader=fs)

    def _draw(self, prog):
        vao = self.ctx.vertex_array(prog, [(self._quad_vbo, "2f", "in_pos")])
        vao.render(mode=moderngl.TRIANGLES, vertices=3)
        vao.release()

    def _bind_common(self, c, t, off=False):
        c["u_bloom_amt"].value = 0.0 if off else self.bloom
        c["u_aberration"].value = 0.0 if off else self.aberration
        c["u_vignette"].value = 0.0 if off else self.vignette
        c["u_grain"].value = 0.0 if off else self.grain
        c["u_scanline"].value = 0.0 if off else self.scanline
        c["u_exposure"].value = 1.0 if off else self.exposure
        c["u_time"].value = t
        c["u_res"].value = self.size

    def render(self, target_fbo, t: float):
        ctx = self.ctx
        ctx.disable(moderngl.DEPTH_TEST)
        ctx.disable(moderngl.BLEND)
        c = self.p_comp

        if not self.enabled:
            target_fbo.use()
            ctx.viewport = (0, 0, *self.size)
            self.scene_tex.use(0)
            c["u_scene"].value = 0
            for i in range(self.LEVELS):
                self.levels[i][0][1].use(1 + i)
                c[f"u_b{i}"].value = 1 + i
            self._bind_common(c, t, off=True)
            self._draw(c)
            return

        (a0, _), _, s0 = self.levels[0]
        a0.use()
        ctx.viewport = (0, 0, *s0)
        self.scene_tex.use(0)
        self.p_bright["u_src"].value = 0
        self.p_bright["u_threshold"].value = self.threshold
        self.p_bright["u_knee"].value = self.knee
        self._draw(self.p_bright)

        for i in range(1, self.LEVELS):
            (fa, _), _, (w, h) = self.levels[i]
            fa.use()
            ctx.viewport = (0, 0, w, h)
            prev = self.levels[i - 1][0][1]
            prev.use(0); self.p_up["u_src"].value = 0
            prev.use(1); self.p_up["u_add"].value = 1
            self.p_up["u_mix"].value = 0.0
            self._draw(self.p_up)

        for i in range(self.LEVELS):
            (fa, ta), (fb, tb), (w, h) = self.levels[i]
            fb.use()
            ctx.viewport = (0, 0, w, h)
            ta.use(0)
            self.p_blur["u_src"].value = 0
            self.p_blur["u_dir"].value = (1.0 / w, 0.0)
            self._draw(self.p_blur)

            fa.use()
            ctx.viewport = (0, 0, w, h)
            tb.use(0)
            self.p_blur["u_src"].value = 0
            self.p_blur["u_dir"].value = (0.0, 1.0 / h)
            self._draw(self.p_blur)

        target_fbo.use()
        ctx.viewport = (0, 0, *self.size)
        self.scene_tex.use(0)
        c["u_scene"].value = 0
        for i in range(self.LEVELS):
            self.levels[i][0][1].use(1 + i)
            c[f"u_b{i}"].value = 1 + i
        self._bind_common(c, t)
        self._draw(c)
