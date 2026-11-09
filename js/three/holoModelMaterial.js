import * as THREE from "three";

const VS = `
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vY = wp.y;
  gl_Position = projectionMatrix * mv;
}
`;

const FS = `
precision highp float;
varying vec3 vN;
varying vec3 vV;
varying float vY;
uniform vec3 cBase;
uniform vec3 cRim;
uniform float rimPow;
uniform float baseA;
uniform float rimA;
uniform float boost;
uniform float uTime;
uniform float uMinY;
uniform float uSpan;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), rimPow);
  vec3 col = mix(cBase, cRim, f);
  float a = mix(baseA, rimA, f);
  float scan = 0.5 + 0.5 * sin(vY / max(uSpan, 1e-4) * 160.0 - uTime * 4.0);
  col *= 0.85 + 0.25 * scan;
  float h = (vY - uMinY) / max(uSpan, 1e-4);
  float beam = exp(-pow((h - fract(uTime / 6.0)) / 0.035, 2.0));
  col += cRim * beam * 1.6;
  a = clamp(a + beam * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col * boost, a);
}
`;

export function buildHoloModelMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      cBase: { value: new THREE.Color(0x0e5d78) },
      cRim: { value: new THREE.Color(0x7ff4ff) },
      rimPow: { value: 2.2 },
      baseA: { value: 0.24 },
      rimA: { value: 0.9 },
      boost: { value: 1.6 },
      uTime: { value: 0 },
      uMinY: { value: -1 },
      uSpan: { value: 2 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
