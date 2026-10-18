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

// medio, anular y menique recogidos hacia la palma
const CURLED = {
  10: [0, -1.25], 11: [0.02, -1.0], 12: [0.02, -0.85],
  14: [0.27, -1.2], 15: [0.28, -1.0], 16: [0.27, -0.85],
  18: [0.52, -1.05], 19: [0.52, -0.9], 20: [0.5, -0.8],
};

const POSES = {
  // indice doblado tocando el pulgar ("OK")
  pinch: { 4: [-0.35, -1.05], 6: [-0.3, -1.3], 7: [-0.35, -1.25], 8: [-0.3, -1.1] },
  // soltando como una mano real: solo se abre el pulgar (el punto medio salta ~35 px)
  open: { 4: [-0.8, -0.6], 6: [-0.3, -1.3], 7: [-0.35, -1.25], 8: [-0.3, -1.1] },
  // palma abierta: cuatro dedos estirados y pulgar separado
  palm: { 4: [-0.9, -0.5], 6: [-0.3, -1.35], 7: [-0.33, -1.65], 8: [-0.35, -1.95] },
  // pinch "cerrado": puntas de pulgar e indice juntas, medio/anular/menique recogidos
  pinch_closed: { 4: [-0.45, -1.0], 6: [-0.3, -1.3], 7: [-0.4, -1.2], 8: [-0.42, -1.05], ...CURLED },
  // soltando el pinch cerrado: se abre el pulgar, los otros tres siguen recogidos
  open_closed: { 4: [-0.8, -0.6], 6: [-0.3, -1.3], 7: [-0.4, -1.2], 8: [-0.42, -1.05], ...CURLED },
  // puno: el indice tambien metido en la palma y el pulgar cruzado encima
  fist: { 4: [-0.12, -1.05], 6: [-0.27, -1.2], 7: [-0.2, -0.95], 8: [-0.18, -0.78], ...CURLED },
  // puno con la punta del pulgar sobre la del indice: solo el corte de f8 lo rechaza
  fist_tight: { 4: [-0.2, -0.85], 6: [-0.27, -1.2], 7: [-0.2, -0.95], 8: [-0.18, -0.78], ...CURLED },
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

  // 6. Prueba negativa: mano abierta y quieta (palma a la camara) = ningun evento.
  {
    const tl = createTimeline("palma abierta quieta y mano relajada: no debe dispararse nada");
    tl.repeat(48, () => [hand("palm", 900, 400)]);
    tl.repeat(6, () => [hand("open", 900, 400)]);
    tl.repeat(18, () => [hand("palm", 900, 400)]);
    tl.repeat(6, () => [hand("open", 900, 400)]);
    out.palm = tl.build();
  }

  // 7. Menu (docs/14 paso A): grab RAPIDO sobre el orbe HeyTECHI con temblor de
  //    +-6 px = click (abre el menu). El orbe esta en (48,216) y mide 128 px.
  {
    const rand = seededJitter(3);
    const tl = createTimeline("grab rapido sobre el orbe con temblor: abre el menu");
    tl.repeat(10, () => [hand("open", 112 + rand(), 280 + rand())]);
    tl.repeat(5, () => [hand("pinch", 112 + rand(), 280 + rand())]);
    tl.repeat(30, () => [hand("open", 112 + rand(), 280 + rand())]);
    out.menu_orb_click = tl.build();
  }

  // 8. Menu: MANTENER el grab sobre el orbe (~0.6 s, se "levanta") y moverlo:
  //    el orbe se mueve y el menu NO se abre.
  {
    const rand = seededJitter(5);
    const tl = createTimeline("mantener grab sobre el orbe y arrastrarlo: se mueve sin abrir el menu");
    tl.repeat(10, () => [hand("open", 112 + rand(), 280 + rand())]);
    tl.repeat(20, () => [hand("pinch", 112 + rand(), 280 + rand())]);
    tl.repeat(20, (i, n) => [hand("pinch", lerp(112, 360, i / (n - 1)) + rand(), lerp(280, 480, i / (n - 1)) + rand())]);
    tl.repeat(6, () => [hand("pinch", 360 + rand(), 480 + rand())]);
    tl.repeat(15, () => [hand("open", 360 + rand(), 480 + rand())]);
    out.menu_orb_drag = tl.build();
  }

  // 9. Menu (docs/14 paso B): abrir el menu y elegir filas con la mano.
  //    Con la mano ABIERTA el cursor queda (-25, +25) px respecto del punto de
  //    pinch; al juntar los dedos salta (+25, -25). La mano llega a "Vista" desde
  //    ABAJO (queda resaltada) y apunta a su parte alta (y=402): al juntar los
  //    dedos el cursor cae en "Herramientas", fuera incluso de la histeresis, y
  //    aun asi debe desplegarse Vista (punto de intencion). Luego pulsa
  //    "Depuracion". Posiciones medidas con el panel en (206,199), 1280x720.
  {
    const rand = seededJitter(9);
    const J = 25; // salto del cursor al juntar los dedos
    const aim = (cx, cy) => [cx + J, cy - J]; // punto de pinch para que el cursor abierto quede en (cx, cy)
    const tl = createTimeline("abrir menu, desplegar Vista apuntando a su borde alto, pulsar Depuracion");
    const orb = aim(118, 286), below = aim(370, 530), vista = aim(370, 402), debug = aim(380, 597);
    const still = (n, pose, [x, y]) => tl.repeat(n, () => [hand(pose, x + rand(), y + rand())]);
    const move = (n, [x0, y0], [x1, y1]) =>
      tl.repeat(n, (i, m) => [hand("open", lerp(x0, x1, i / (m - 1)) + rand(), lerp(y0, y1, i / (m - 1)) + rand())]);
    still(10, "open", orb); still(4, "pinch", orb); still(8, "open", orb);
    move(12, orb, below); move(8, below, vista); still(12, "open", vista); still(4, "pinch", vista); still(10, "open", vista);
    move(10, vista, debug); still(12, "open", debug); still(4, "pinch", debug); still(15, "open", debug);
    out.menu_select = tl.build();
  }

  // 10. Menu (docs/14 paso C, M5): con "Seleccionar dejando el cursor quieto"
  //     activado, abrir el menu con pinch y luego elegir Vista y Depuracion SIN
  //     pinch, solo dejando la mano quieta ~1 s (temblor de +-6 px).
  {
    const rand = seededJitter(10);
    const J = 25;
    const aim = (cx, cy) => [cx + J, cy - J];
    const tl = createTimeline("permanencia: abrir menu con pinch, elegir Vista y Depuracion dejando la mano quieta");
    const orb = aim(118, 286), below = aim(370, 530), vista = aim(370, 418), debug = aim(380, 597);
    const still = (n, pose, [x, y]) => tl.repeat(n, () => [hand(pose, x + rand(), y + rand())]);
    const move = (n, [x0, y0], [x1, y1]) =>
      tl.repeat(n, (i, m) => [hand("open", lerp(x0, x1, i / (m - 1)) + rand(), lerp(y0, y1, i / (m - 1)) + rand())]);
    still(8, "open", orb); still(4, "pinch", orb); still(4, "open", orb);
    move(10, orb, below); move(6, below, vista); still(32, "open", vista);
    move(8, vista, debug); still(32, "open", debug);
    out.menu_dwell = tl.build();
  }

  // 11. Calibracion (docs/14 paso D): el protocolo del asistente con valores
  //     CONOCIDOS para verificar que el analisis los recupera. Mano abierta:
  //     ratio 0.707; pinch: 0.071; salto del cursor al juntar los dedos: 35 px;
  //     temblor uniforme de +-3 px.
  {
    const rand = seededJitter(11, 3);
    const tl = createTimeline("calibracion: 3 s abierta y quieta, 2 s en pinch, 4 pinch y soltar");
    const P = [640, 360];
    const still = (n, pose) => tl.repeat(n, () => [hand(pose, P[0] + rand(), P[1] + rand())]);
    still(90, "open");
    still(60, "pinch");
    for (let k = 0; k < 4; k++) { still(10, "open"); still(10, "pinch"); }
    still(10, "open");
    out.calibration = tl.build();
  }

  // 12. Pinch "cerrado" (medio, anular y menique abajo): agarra el reactor y lo
  //     arrastra +200 px igual que el pinch OK.
  {
    const tl = createTimeline("pinch con los otros tres dedos recogidos: agarra y arrastra +200px");
    tl.repeat(8, () => [hand("open_closed", 600, 300)]);
    tl.repeat(30, (i, n) => [hand("pinch_closed", lerp(600, 800, i / (n - 1)), 300)]);
    tl.repeat(15, () => [hand("pinch_closed", 800, 300)]);
    tl.repeat(10, () => [hand("open_closed", 800, 300)]);
    out.pinch_closed = tl.build();
  }

  // 13. Empieza con pinch OK y a mitad del arrastre recoge los otros tres dedos:
  //     NO debe soltarse.
  {
    const tl = createTimeline("pinch OK que se cierra a mitad del arrastre: no se suelta");
    tl.repeat(8, () => [hand("open", 600, 300)]);
    tl.repeat(15, (i, n) => [hand("pinch", lerp(600, 700, i / (n - 1)), 300)]);
    tl.repeat(15, (i, n) => [hand("pinch_closed", lerp(700, 800, i / (n - 1)), 300)]);
    tl.repeat(10, () => [hand("pinch_closed", 800, 300)]);
    tl.repeat(10, () => [hand("open_closed", 800, 300)]);
    out.pinch_mixed = tl.build();
  }

  // 14. Prueba negativa: un puno (y un puno apretado con el pulgar sobre la punta
  //     del indice) que pasa sobre el reactor no es pinch.
  {
    const tl = createTimeline("puno moviendose sobre el reactor: no debe agarrar nada");
    tl.repeat(30, (i, n) => [hand("fist", lerp(500, 800, i / (n - 1)), 300)]);
    tl.repeat(30, (i, n) => [hand("fist_tight", lerp(800, 500, i / (n - 1)), 300)]);
    tl.repeat(8, () => [hand("open", 500, 300)]);
    out.fist = tl.build();
  }

  return out;
}

// Temblor determinista de +-6 px (mano real sostenida en el aire).
function seededJitter(seed, amp = 6) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 4294967296 * 2 - 1) * amp; };
}
