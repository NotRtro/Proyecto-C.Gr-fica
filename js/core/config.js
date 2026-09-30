// Constantes compartidas. Todo umbral ajustable vive aqui, no dentro de la logica.

// Umbrales de pinch (docs/05): entrar exige mas confianza que sostener (histeresis).
// arch/backMean vienen documentados; los cortes de "ratio" son un punto de partida
// a recalibrar en vivo con el overlay de debug (tecla H).
export const PINCH = {
  RATIO_ENTER: 0.35, RATIO_HOLD: 0.45,
  ARCH_ENTER: 0.18, BACKMEAN_ENTER: 1.30,
  ARCH_HOLD: 0.12, BACKMEAN_HOLD: 1.15,
};

export const TAP = { MAX_MS: 300, MAX_PX: 26 };

// Fraccion del camino recorrido por frame al seguir un objetivo (arrastre, render page).
export const FOLLOW_LERP = 0.5;

export const RING_PX = 440;
export const RING_COLORS = { idle: "#7c93a8", listening: "#33d1ff", thinking: "#ffb238", speaking: "#33ff9c" };
export const RING_POLL_MS = 750;

export const MODEL_PX = 480;

// Mismas tasas que core/hologram.py.
export const HOLO = {
  SPIN: 0.55,          // rad/s de giro automatico
  EXPLODE_RATE: 5.0,   // suavizado exponencial de explode
  DISSOLVE_RATE: 3.2,  // suavizado exponencial de dissolve
  EXPLODE_OUT: 2.2,    // objetivo de explode al "desarmar"
};
