export const VIDEO = { w: 1280, h: 720 };
export const FRAME_MS = 33;
const SPAN_PX = 110;

const BASE = {
  0: [0, 0], 1: [-0.35, -0.25], 2: [-0.55, -0.45], 3: [-0.7, -0.6],
  5: [-0.25, -1.0], 9: [0, -1.0], 13: [0.25, -1.0], 17: [0.5, -0.9],
  10: [0, -1.35], 11: [0, -1.7], 12: [0, -2.0],
  14: [0.3, -1.3], 15: [0.33, -1.6], 16: [0.35, -1.9],
  18: [0.55, -1.2], 19: [0.6, -1.45], 20: [0.65, -1.65],
};

const CURLED = {
  10: [0, -1.25], 11: [0.02, -1.0], 12: [0.02, -0.85],
  14: [0.27, -1.2], 15: [0.28, -1.0], 16: [0.27, -0.85],
  18: [0.52, -1.05], 19: [0.52, -0.9], 20: [0.5, -0.8],
};

const POSES = {
  pinch: { 4: [-0.35, -1.05], 6: [-0.3, -1.3], 7: [-0.35, -1.25], 8: [-0.3, -1.1] },
  open: { 4: [-0.8, -0.6], 6: [-0.3, -1.3], 7: [-0.35, -1.25], 8: [-0.3, -1.1] },
  palm: { 4: [-0.9, -0.5], 6: [-0.3, -1.35], 7: [-0.33, -1.65], 8: [-0.35, -1.95] },
  pinch_closed: { 4: [-0.45, -1.0], 6: [-0.3, -1.3], 7: [-0.4, -1.2], 8: [-0.42, -1.05], ...CURLED },
  open_closed: { 4: [-0.8, -0.6], 6: [-0.3, -1.3], 7: [-0.4, -1.2], 8: [-0.42, -1.05], ...CURLED },
  fist: { 4: [-0.12, -1.05], 6: [-0.27, -1.2], 7: [-0.2, -0.95], 8: [-0.18, -0.78], ...CURLED },
  fist_tight: { 4: [-0.2, -0.85], 6: [-0.27, -1.2], 7: [-0.2, -0.95], 8: [-0.18, -0.78], ...CURLED },
  relaxed: {
    4: [-0.45, -0.8], 6: [-0.3, -1.3], 7: [-0.33, -1.35], 8: [-0.3, -1.25],
    10: [0, -1.35], 11: [0.03, -1.5], 12: [0.05, -1.45],
    14: [0.28, -1.3], 15: [0.31, -1.42], 16: [0.33, -1.38],
    18: [0.53, -1.12], 19: [0.57, -1.25], 20: [0.6, -1.22],
  },
  dial: {
    1: [-0.35, -0.15, -0.2], 2: [-0.55, -0.3, -0.45], 3: [-0.65, -0.4, -0.7], 4: [-0.72, -0.45, -0.95],
    5: [-0.38, -0.45, -0.85], 6: [-0.4, -0.5, -1.3], 7: [-0.41, -0.52, -1.6], 8: [-0.42, -0.53, -1.85],
    9: [-0.12, -0.5, -0.88], 10: [-0.12, -0.55, -1.35], 11: [-0.12, -0.57, -1.7], 12: [-0.12, -0.58, -1.95],
    13: [0.12, -0.48, -0.85], 14: [0.13, -0.52, -1.3], 15: [0.13, -0.54, -1.6], 16: [0.13, -0.55, -1.85],
    17: [0.35, -0.42, -0.75], 18: [0.36, -0.45, -1.15], 19: [0.36, -0.47, -1.4], 20: [0.36, -0.48, -1.6],
  },
  fist_forward: {
    4: [-0.12, -1.05, -0.5], 5: [-0.25, -1.0, -0.7], 6: [-0.27, -1.2, -0.75], 7: [-0.2, -0.95, -0.7], 8: [-0.18, -0.78, -0.6],
    9: [0, -1.0, -0.7], 13: [0.25, -1.0, -0.65], 17: [0.5, -0.9, -0.55],
    ...Object.fromEntries(Object.entries(CURLED).map(([k, [x, y]]) => [k, [x, y, -0.6]])),
  },
};

const PINCH_POINT = [(-0.35 - 0.3) / 2, (-1.05 - 1.1) / 2];

const POSE_GESTURE = { palm: "Open_Palm", fist: "Closed_Fist", fist_tight: "Closed_Fist", fist_forward: "Closed_Fist" };
const SPAN_M = 0.09;

export function hand(pose, px, py, label = "Right", { roll = 0, model = false, gesture = null, span = SPAN_PX } = {}) {
  const pts = { ...BASE, ...POSES[pose] };
  const wx = px - PINCH_POINT[0] * span, wy = py - PINCH_POINT[1] * span;
  const c = Math.cos(roll * Math.PI / 180), s = Math.sin(roll * Math.PI / 180);
  const lm = [], wl = [];
  for (let i = 0; i < 21; i++) {
    const [ux0, uy0, uz = 0] = pts[i] || [0, -0.5];
    const ux = ux0 * c - uy0 * s, uy = ux0 * s + uy0 * c;
    const sx = wx + ux * span, sy = wy + uy * span;
    lm.push([+(1 - sx / VIDEO.w).toFixed(5), +(sy / VIDEO.h).toFixed(5), +(uz * span / VIDEO.w).toFixed(5)]);
    wl.push([+(-ux * SPAN_M).toFixed(5), +(uy * SPAN_M).toFixed(5), +(uz * SPAN_M).toFixed(5)]);
  }
  if (!model) return { label, lm };
  return { label, lm, wl, g: [gesture || POSE_GESTURE[pose] || "None", 0.9] };
}

export function createTimeline(description) {
  const frames = [];
  let phase = null;
  return {
    phase(name) { phase = name; },
    add(...hands) { frames.push({ t: frames.length * FRAME_MS, hands, ...(phase ? { phase } : {}) }); },
    repeat(n, fn) { for (let i = 0; i < n; i++) this.add(...fn(i, n)); },
    build() { return { version: 1, synthetic: true, description, video: VIDEO, frames }; },
  };
}

const lerp = (a, b, f) => a + (b - a) * f;

export function scenarios() {
  const out = {};

  {
    const tl = createTimeline("pinch sobre el reactor, arrastre +200px, soltar");
    tl.repeat(8, () => [hand("open", 600, 300)]);
    tl.repeat(30, (i, n) => [hand("pinch", lerp(600, 800, i / (n - 1)), 300)]);
    tl.repeat(15, () => [hand("pinch", 800, 300)]);
    tl.repeat(10, () => [hand("open", 800, 300)]);
    out.pinch_drag = tl.build();
  }

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

  {
    const tl = createTimeline("pinch en vacio: +400px explota, -160px arma un poco; vertical no hace nada");
    tl.repeat(6, () => [hand("open", 200, 590)]);
    tl.repeat(30, (i, n) => [hand("pinch", lerp(200, 600, i / (n - 1)), 590)]);
    tl.repeat(12, (i, n) => [hand("pinch", lerp(600, 440, i / (n - 1)), 590)]);
    tl.repeat(10, () => [hand("pinch", 440, 590)]);
    tl.repeat(8, () => [hand("open", 440, 590)]);
    tl.repeat(20, (i, n) => [hand("pinch", 150, lerp(590, 490, i / (n - 1)))]);
    tl.repeat(8, () => [hand("open", 150, 490)]);
    out.explode_drag = tl.build();
  }

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

  {
    const tl = createTimeline("palma de alto quieta: detiene el giro una vez; ningun pinch ni tap");
    tl.repeat(48, () => [hand("palm", 900, 400)]);
    tl.repeat(6, () => [hand("open", 900, 400)]);
    tl.repeat(18, () => [hand("palm", 900, 400)]);
    tl.repeat(6, () => [hand("open", 900, 400)]);
    out.palm = tl.build();
  }

  {
    const rand = seededJitter(3);
    const tl = createTimeline("grab rapido sobre el orbe con temblor: abre el menu");
    tl.repeat(10, () => [hand("open", 112 + rand(), 280 + rand())]);
    tl.repeat(5, () => [hand("pinch", 112 + rand(), 280 + rand())]);
    tl.repeat(30, () => [hand("open", 112 + rand(), 280 + rand())]);
    out.menu_orb_click = tl.build();
  }

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

  {
    const rand = seededJitter(9);
    const J = 25;
    const aim = (cx, cy) => [cx + J, cy - J];
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

  {
    const rand = seededJitter(11, 3);
    const tl = createTimeline("calibracion: abierta y quieta, pinch, pinch y soltar, puno, mano relajada");
    const P = [640, 360];
    const still = (n, pose) => tl.repeat(n, () => [hand(pose, P[0] + rand(), P[1] + rand())]);
    tl.phase("open"); still(90, "open");
    tl.phase("pinch"); still(60, "pinch");
    tl.phase("taps");
    for (let k = 0; k < 4; k++) { still(10, "open"); still(10, "pinch"); }
    still(10, "open");
    tl.phase("fist"); still(30, "fist"); still(30, "fist_tight");
    tl.phase("relaxed"); still(60, "relaxed");
    out.calibration = tl.build();
  }

  {
    const tl = createTimeline("pinch con los otros tres dedos recogidos: agarra y arrastra +200px");
    tl.repeat(8, () => [hand("open_closed", 600, 300)]);
    tl.repeat(30, (i, n) => [hand("pinch_closed", lerp(600, 800, i / (n - 1)), 300)]);
    tl.repeat(15, () => [hand("pinch_closed", 800, 300)]);
    tl.repeat(10, () => [hand("open_closed", 800, 300)]);
    out.pinch_closed = tl.build();
  }

  {
    const tl = createTimeline("pinch OK que se cierra a mitad del arrastre: no se suelta");
    tl.repeat(8, () => [hand("open", 600, 300)]);
    tl.repeat(15, (i, n) => [hand("pinch", lerp(600, 700, i / (n - 1)), 300)]);
    tl.repeat(15, (i, n) => [hand("pinch_closed", lerp(700, 800, i / (n - 1)), 300)]);
    tl.repeat(10, () => [hand("pinch_closed", 800, 300)]);
    tl.repeat(10, () => [hand("open_closed", 800, 300)]);
    out.pinch_mixed = tl.build();
  }

  {
    const tl = createTimeline("puno moviendose sobre el reactor: no debe agarrar nada");
    tl.repeat(30, (i, n) => [hand("fist", lerp(500, 800, i / (n - 1)), 300)]);
    tl.repeat(30, (i, n) => [hand("fist_tight", lerp(800, 500, i / (n - 1)), 300)]);
    tl.repeat(8, () => [hand("open", 500, 300)]);
    out.fist = tl.build();
  }

  {
    const rand = seededJitter(15, 4);
    const tl = createTimeline("palma de alto: moviendose nada; quieta detiene; otra vez reanuda");
    tl.repeat(30, (i, n) => [hand("palm", lerp(500, 800, i / (n - 1)), 300)]);
    tl.repeat(8, () => [hand("open", 800, 300)]);
    tl.repeat(30, () => [hand("palm", 700 + rand(), 300 + rand())]);
    tl.repeat(8, () => [hand("open", 700, 300)]);
    tl.repeat(30, () => [hand("palm", 700 + rand(), 300 + rand())]);
    tl.repeat(8, () => [hand("open", 700, 300)]);
    out.palm_stop = tl.build();
  }

  {
    const rand = seededJitter(16, 3);
    const tl = createTimeline("palma perilla: girar la muneca 40 grados gira el modelo");
    tl.repeat(8, () => [hand("open", 640, 330)]);
    tl.repeat(10, () => [hand("dial", 640 + rand(), 330 + rand())]);
    tl.repeat(30, (i, n) => [hand("dial", 640 + rand(), 330 + rand(), "Right", { roll: lerp(0, 40, i / (n - 1)) })]);
    tl.repeat(10, () => [hand("dial", 640 + rand(), 330 + rand(), "Right", { roll: 40 })]);
    tl.repeat(10, () => [hand("open", 640, 330)]);
    out.palm_dial = tl.build();
  }

  {
    const tl = createTimeline("soltar un pinch abriendo la mano y puno hacia la camara: ninguna palma");
    tl.repeat(8, () => [hand("open", 300, 600)]);
    tl.repeat(15, () => [hand("pinch", 300, 600)]);
    tl.repeat(24, () => [hand("palm", 300, 600)]);
    tl.repeat(8, () => [hand("open", 300, 600)]);
    tl.repeat(40, () => [hand("fist_forward", 640, 330)]);
    out.palm_negative = tl.build();
  }

  {
    const rand = seededJitter(18, 4);
    const tl = createTimeline("modelo: palma quieta detiene; palma que el modelo NO ve abierta no detiene");
    tl.repeat(8, () => [hand("open", 700, 300, "Right", { model: true })]);
    tl.repeat(30, () => [hand("palm", 700 + rand(), 300 + rand(), "Right", { model: true })]);
    tl.repeat(8, () => [hand("open", 700, 300, "Right", { model: true })]);
    tl.repeat(30, () => [hand("palm", 700 + rand(), 300 + rand(), "Right", { model: true, gesture: "None" })]);
    tl.repeat(8, () => [hand("open", 700, 300, "Right", { model: true })]);
    out.model_palm = tl.build();
  }
  {
    const rand = seededJitter(19, 3);
    const tl = createTimeline("modelo + metros: perilla 40 grados; puno hacia la camara no es perilla");
    tl.repeat(8, () => [hand("open", 640, 330, "Right", { model: true })]);
    tl.repeat(10, () => [hand("dial", 640 + rand(), 330 + rand(), "Right", { model: true })]);
    tl.repeat(30, (i, n) => [hand("dial", 640 + rand(), 330 + rand(), "Right", { model: true, roll: lerp(0, 40, i / (n - 1)) })]);
    tl.repeat(10, () => [hand("dial", 640 + rand(), 330 + rand(), "Right", { model: true, roll: 40 })]);
    tl.repeat(10, () => [hand("open", 640, 330, "Right", { model: true })]);
    tl.repeat(40, () => [hand("fist_forward", 640, 330, "Right", { model: true })]);
    out.model_dial = tl.build();
  }
  {
    const rand = seededJitter(20, 3);
    const tl = createTimeline("volante: palma de alto inclinada 40 grados gira el modelo y no lo detiene");
    tl.repeat(8, () => [hand("open", 700, 300, "Right", { model: true })]);
    tl.repeat(6, () => [hand("palm", 700 + rand(), 300 + rand(), "Right", { model: true })]);
    tl.repeat(24, (i, n) => [hand("palm", 700 + rand(), 300 + rand(), "Right", { model: true, roll: lerp(0, 40, i / (n - 1)) })]);
    tl.repeat(10, () => [hand("palm", 700 + rand(), 300 + rand(), "Right", { model: true, roll: 40 })]);
    tl.repeat(10, () => [hand("open", 700, 300, "Right", { model: true })]);
    out.model_volante = tl.build();
  }

  return out;
}

function seededJitter(seed, amp = 6) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 4294967296 * 2 - 1) * amp; };
}
