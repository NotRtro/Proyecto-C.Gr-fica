// Constantes compartidas. Todo umbral ajustable vive aqui, no dentro de la logica.

// Umbrales de pinch (docs/05): entrar exige mas confianza que sostener (histeresis).
// arch/backMean vienen documentados; los cortes de "ratio" son un punto de partida
// a recalibrar en vivo con el overlay de debug (tecla H).
export const PINCH = {
  RATIO_ENTER: 0.35, RATIO_HOLD: 0.45,
  ARCH_ENTER: 0.18, BACKMEAN_ENTER: 1.30,
  ARCH_HOLD: 0.12, BACKMEAN_HOLD: 1.15,
  CONFIRM_FRAMES: 2, // frames de camara seguidos para confirmar entrar/salir (anti parpadeo)
};

export const TAP = { MAX_MS: 300, MAX_PX: 26 };

// Seguimiento de manos: identidad estable aunque MediaPipe intercambie Left/Right.
export const HANDS = {
  MATCH_MAX: 0.25,       // distancia maxima de muneca (fraccion del video) para ser la misma mano
  LOST_GRACE_MS: 180,    // una mano perdida brevemente conserva su ID y lo que agarraba
  HANDEDNESS_WINDOW: 8,  // frames para votar la lateralidad (Left/Right)
};

// Palma abierta sostenida (reservado para abrir el menu en la fase 5).
export const PALM = {
  EXT_MIN: 1.55,    // cada dedo: dist(punta, muneca) / dist(nudillo, muneca)
  SPREAD_MIN: 0.6,  // separacion pulgar-indice / span de la mano
  HOLD_MS: 1000,
  STILL_PX: 60,     // si la mano se mueve mas que esto, el conteo se reinicia
};

export const TWO_HAND = {
  SCALE_MIN: 0.3, SCALE_MAX: 3.0,
  ROT_DEADZONE: 3 * Math.PI / 180, // +-3 grados sin efecto (anti temblor)
  JOIN_PX: 320,     // la 2a mano se une si hace pinch a esta distancia del objeto agarrado
};

// Pinch en vacio + arrastre horizontal = explode/assemble del modelo.
export const EXPLODE_DRAG = {
  START_PX: 24,     // desplazamiento minimo para decidir la direccion
  PX_FULL: 320,     // pixeles de arrastre para ir de armado a totalmente explotado
};

export const MOUSE = {
  WHEEL_SCALE: 0.0015, // factor por unidad de deltaY de la rueda
  WHEEL_ROTATE: 0.004, // radianes por unidad de deltaY con Shift
};

// Fraccion del camino recorrido por frame al seguir un objetivo (arrastre, render page).
export const FOLLOW_LERP = 0.5;

export const PUSH_HZ = 30; // publicaciones de /state por segundo

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
