// Generador de manos sinteticas. Construye los 21 landmarks de MediaPipe a partir
// de poses simples (pinch, mano soltando, palma abierta) para crear grabaciones
// de prueba deterministas. Las grabaciones reales (tecla G) usan el mismo formato.
//
// Las poses estan en unidades de "span" (muneca -> nudillo del medio), en
// coordenadas de pantalla (y hacia abajo), relativas a la muneca.
export const VIDEO = { w: 1280, h: 720 };
export const FRAME_MS = 33; // ~30 fps, como una webcam
const SPAN_PX = 110;

const BASE = {
  0: [0, 0], 1: [-0.35, -0.25], 2: [-0.55, -0.45], 3: [-0.7, -0.6],
  5: [-0.25, -1.0], 9: [0, -1.0], 13: [0.25, -1.0], 17: [0.5, -0.9],
  10: [0, -1.35], 11: [0, -1.7], 12: [0, -2.0],
  14: [0.3, -1.3], 15: [0.33, -1.6], 16: [0.35, -1.9],
  18: [0.55, -1.2], 19: [0.6, -1.45], 20: [0.65, -1.65],
};

const POSES = {
  // indice doblado tocando el pulgar ("OK")
  pinch: { 4: [-0.35, -1.05], 6: [-0.3, -1.3], 7: [-0.35, -1.25], 8: [-0.3, -1.1] },
  // soltando como una mano real: solo se abre el pulgar (el punto medio salta ~35 px)
  open: { 4: [-0.8, -0.6], 6: [-0.3, -1.3], 7: [-0.35, -1.25], 8: [-0.3, -1.1] },
  // palma abierta: cuatro dedos estirados y pulgar separado
  palm: { 4: [-0.9, -0.5], 6: [-0.3, -1.35], 7: [-0.33, -1.65], 8: [-0.35, -1.95] },
};

// Punto de pinch de la pose "pinch" (medio entre 4 y 8) respecto de la muneca.
const PINCH_POINT = [(-0.35 - 0.3) / 2, (-1.05 - 1.1) / 2];

// Mano cuya pose de pinch caeria en (px, py) de pantalla.
export function hand(pose, px, py, label = "Right") {
  const pts = { ...BASE, ...POSES[pose] };
  const wx = px - PINCH_POINT[0] * SPAN_PX, wy = py - PINCH_POINT[1] * SPAN_PX;
  const lm = [];
  for (let i = 0; i < 21; i++) {
    const [ux, uy] = pts[i] || [0, -0.5];
    const sx = wx + ux * SPAN_PX, sy = wy + uy * SPAN_PX;
    // pantalla -> landmark normalizado (deshace el espejo de toScreen)
    lm.push([+(1 - sx / VIDEO.w).toFixed(5), +(sy / VIDEO.h).toFixed(5), 0]);
  }
  return { label, lm };
}

export function createTimeline(description) {
  const frames = [];
  return {
    add(...hands) { frames.push({ t: frames.length * FRAME_MS, hands }); },
    repeat(n, fn) { for (let i = 0; i < n; i++) this.add(...fn(i, n)); },
    build() { return { version: 1, synthetic: true, description, video: VIDEO, frames }; },
  };
}

const lerp = (a, b, f) => a + (b - a) * f;

export function scenarios() {
  const out = {};

  // 1. Agarrar el reactor, arrastrarlo 200 px a la derecha y soltar.
  {
    const tl = createTimeline("pinch sobre el reactor, arrastre +200px, soltar");
    tl.repeat(8, () => [hand("open", 600, 300)]);
    tl.repeat(30, (i, n) => [hand("pinch", lerp(600, 800, i / (n - 1)), 300)]);
    tl.repeat(15, () => [hand("pinch", 800, 300)]);
    tl.repeat(10, () => [hand("open", 800, 300)]);
    out.pinch_drag = tl.build();
  }

  // 2. Tap rapido sobre una tarjeta (soltando solo el pulgar) + un pinch lento que NO es tap.
  {
    const tl = createTimeline("tap rapido sobre tarjeta y luego pinch lento (no es tap)");
    tl.repeat(6, () => [hand("open", 300, 200)]);
    tl.repeat(4, () => [hand("pinch", 300, 200)]);
    tl.repeat(10, () => [hand("open", 300, 200)]);
    tl.repeat(20, () => [hand("pinch", 300, 200)]);
    tl.repeat(10, () => [hand("open", 300, 200)]);
    out.tap = {
      ...tl.build(),
      setup: [{ a: "add_card", title: "Tarjeta", body: "Un tap la expande.\nUn pinch lento no.",
        x: 300 / VIDEO.w, y: 200 / VIDEO.h }],
    };
  }

  // 3. Dos manos: separar al doble (escala x2) girando 20 grados; soltar una y
  //    seguir arrastrando con la otra.
  {
    const tl = createTimeline("dos manos: escala x2 + giro 20 grados, luego una mano sigue arrastrando");
    const mid = [640, 360], ang = (20 * Math.PI) / 180;
    const A = (r, a) => [mid[0] - r * Math.cos(a), mid[1] - r * Math.sin(a)];
    const B = (r, a) => [mid[0] + r * Math.cos(a), mid[1] + r * Math.sin(a)];
    tl.repeat(6, () => [hand("open", ...A(80, 0), "Left"), hand("open", ...B(80, 0), "Right")]);
    tl.repeat(4, () => [hand("pinch", ...A(80, 0), "Left"), hand("open", ...B(80, 0), "Right")]);
    tl.repeat(4, () => [hand("pinch", ...A(80, 0), "Left"), hand("pinch", ...B(80, 0), "Right")]);
    tl.repeat(30, (i, n) => {
      const f = i / (n - 1), r = lerp(80, 160, f), a = lerp(0, ang, f);
      return [hand("pinch", ...A(r, a), "Left"), hand("pinch", ...B(r, a), "Right")];
    });
    tl.repeat(15, () => [hand("pinch", ...A(160, ang), "Left"), hand("pinch", ...B(160, ang), "Right")]);
    tl.repeat(6, () => [hand("pinch", ...A(160, ang), "Left"), hand("open", ...B(160, ang), "Right")]);
    const a0 = A(160, ang);
    tl.repeat(15, (i, n) => [hand("pinch", lerp(a0[0], a0[0] + 100, i / (n - 1)), a0[1], "Left")]);
    tl.repeat(10, () => [hand("pinch", a0[0] + 100, a0[1], "Left")]);
    tl.repeat(8, () => [hand("open", a0[0] + 100, a0[1], "Left")]);
    out.two_hand = tl.build();
  }

  // 4. Pinch en vacio + arrastre horizontal = explode; volver a la izquierda = armar
  //    Luego un pinch en vacio vertical no debe hacer nada.
  {
    const tl = createTimeline("pinch en vacio: +400px explota, -160px arma un poco; vertical no hace nada");
    // y=590 queda debajo del reactor (su caja llega a y=564): es "vacio".
    tl.repeat(6, () => [hand("open", 200, 590)]);
    tl.repeat(30, (i, n) => [hand("pinch", lerp(200, 600, i / (n - 1)), 590)]);
    tl.repeat(12, (i, n) => [hand("pinch", lerp(600, 440, i / (n - 1)), 590)]);
    tl.repeat(10, () => [hand("pinch", 440, 590)]);
    tl.repeat(8, () => [hand("open", 440, 590)]);
    tl.repeat(20, (i, n) => [hand("pinch", 150, lerp(590, 490, i / (n - 1)))]);
    tl.repeat(8, () => [hand("open", 150, 490)]);
    out.explode_drag = tl.build();
  }

  // 5. Robustez: durante un arrastre MediaPipe alterna la etiqueta Left/Right en
  //    cada frame y pierde la mano 3 frames (100 ms). No debe soltarse el objeto.
  {
    const tl = createTimeline("arrastre con etiqueta Left/Right alternando y 3 frames sin mano");
    tl.repeat(8, () => [hand("open", 600, 300)]);
    tl.repeat(40, (i, n) => {
      if (i >= 18 && i < 21) return [];
      return [hand("pinch", lerp(600, 800, i / (n - 1)), 300, i % 2 ? "Left" : "Right")];
    });
    tl.repeat(15, () => [hand("pinch", 800, 300)]);
    tl.repeat(10, () => [hand("open", 800, 300)]);
    out.hand_swap = tl.build();
  }

  // 6. Palma abierta 1.6 s = 1 evento; cerrar y abrir 0.6 s = ninguno mas.
  {
    const tl = createTimeline("palma abierta sostenida (dispara 1 vez) y palma corta (no dispara)");
    tl.repeat(48, () => [hand("palm", 900, 400)]);
    tl.repeat(6, () => [hand("open", 900, 400)]);
    tl.repeat(18, () => [hand("palm", 900, 400)]);
    tl.repeat(6, () => [hand("open", 900, 400)]);
    out.palm = tl.build();
  }

  return out;
}
