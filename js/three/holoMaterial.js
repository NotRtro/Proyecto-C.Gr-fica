import * as THREE from "three";

const HOLO_VS = `
attribute vec3 barycentric;
attribute vec3 pivot;
uniform float u_explode;
varying vec3 v_normal;
varying vec3 v_bary;
varying vec3 v_local;
varying vec3 v_view;
void main(){
    vec3 p = position + pivot * u_explode;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    v_normal = normalMatrix * normal;
    v_bary = barycentric;
    v_local = p;
    v_view = -mv.xyz;
    gl_Position = projectionMatrix * mv;
}
`;

const HOLO_FS = `
precision highp float;
varying vec3 v_normal;
varying vec3 v_bary;
varying vec3 v_local;
varying vec3 v_view;
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
    return mix(mix(mix(hash31(i + vec3(0.0,0.0,0.0)), hash31(i + vec3(1.0,0.0,0.0)), f.x),
                   mix(hash31(i + vec3(0.0,1.0,0.0)), hash31(i + vec3(1.0,1.0,0.0)), f.x), f.y),
               mix(mix(hash31(i + vec3(0.0,0.0,1.0)), hash31(i + vec3(1.0,0.0,1.0)), f.x),
                   mix(hash31(i + vec3(0.0,1.0,1.0)), hash31(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
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
    gl_FragColor = vec4(col * u_glow, a);
}
`;

export function buildHoloMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: HOLO_VS,
    fragmentShader: HOLO_FS,
    uniforms: {
      u_time: { value: 0 },
      u_explode: { value: 0 },
      u_tint: { value: new THREE.Vector3(0.25, 0.85, 1.0) },
      u_alpha: { value: 1.0 },
      u_wire: { value: 1.0 },
      u_dissolve: { value: 0.0 },
      u_glow: { value: 1.8 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
