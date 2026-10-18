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

// Pinch "cerrado": medio, anular y menique recogidos (js/input/recognizers/pinch.js).
// Sin la firma OK, lo que lo separa de un puno es que las puntas se tocan de verdad
// y que el indice no esta metido en la palma (en un puno f8 ~0.75; en este pinch ~1.1).
export const PINCH_CLOSED = {
  RATIO_ENTER_K: 0.6, RATIO_HOLD_K: 0.75, // fraccion de PINCH.RATIO_ENTER / RATIO_HOLD (0.21 / 0.34 de fabrica)
  F8_ENTER: 0.9, F8_HOLD: 0.8,            // extension minima del indice
};

export const TAP = { MAX_MS: 300, MAX_PX: 26 };

// Seguimiento de manos: identidad estable aunque MediaPipe intercambie Left/Right.
export const HANDS = {
  MATCH_MAX: 0.25,       // distancia maxima de muneca (fraccion del video) para ser la misma mano
  LOST_GRACE_MS: 180,    // una mano perdida brevemente conserva su ID y lo que agarraba
  HANDEDNESS_WINDOW: 8,  // frames para votar la lateralidad (Left/Right)
};

// Suavizado del cursor de mano (filtro One Euro, js/input/filters.js).
// Recalibrar con grabaciones reales (tecla G) si se siente lento o tembloroso.
export const CURSOR_FILTER = { minCutoff: 1.2, beta: 0.012, dCutoff: 1.0 };

// Click vs arrastre en la interfaz (js/ui/press.js). Los recorridos para la mano
// son relativos a su tamano en pantalla (span = muneca -> nudillo del medio).
export const UI_PRESS = {
  CLICK_MAX_MS: 700,       // un grab mas largo que esto no es click
  HOLD_TO_DRAG_MS: 450,    // mantener quieto este tiempo "levanta" el orbe/panel para moverlo
  TRAVEL_SPAN: 0.5,        // recorrido maximo de un click = 0.5 x span de la mano...
  TRAVEL_MIN: 30, TRAVEL_MAX: 70, // ...acotado a este rango en px
  MOUSE_TRAVEL: 8,         // el mouse no tiembla: umbral fijo y arrastre inmediato
  SHOW_PROGRESS_FROM: 0.3, // el anillo de "levantar" aparece desde este progreso (evita parpadeo en clicks)
};

// A que boton apunta la mano (js/ui/targeting.js, docs/14 paso B).
export const UI_TARGET = {
  INTENT_MS: 350,     // al hacer pinch se elige lo mas apuntado en esta ventana PREVIA...
  INTENT_SKIP_MS: 100, // ...sin contar los ultimos ms (los dedos ya se estaban juntando y el cursor saltaba)
  HISTORY_MS: 500,    // cuanto historial de apuntado se guarda por mano
  HYSTERESIS_PX: 10,  // para cambiar de boton hay que salir del actual por esta distancia
  NEAR_PX: 14,        // en un hueco entre filas, vale el boton mas cercano a esta distancia
  MAGNET: 0.7,        // cuanto se centra el cursor visible en la fila apuntada (0..1)
  // Seleccion por permanencia (opcional, Ajustes): dejar el cursor quieto sobre un
  // boton del menu lo pulsa sin pinch.
  DWELL_MS: 800,
  DWELL_MOVE_PX: 40,  // si el cursor se mueve mas que esto, el conteo se reinicia
  DWELL_SHOW_FROM: 0.2, // el anillo de permanencia aparece desde este progreso
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

export const MODEL_PX = 480;

// Modelos GLB del catalogo (js/items/model.js, fase 6).
export const MODEL = {
  PX: 560,            // lado del canvas de cada modelo (px CSS a escala 1)
  FIT: 1.3,           // diagonal del modelo en unidades de escena (armado ocupa ~2/3 del cuadro)
  CAM_DIST: 3.2,      // distancia de la camara (fov 35) con el modelo armado
  EXPLODE_ZOOM: 0.5,  // al desarmarlo del todo la camara se aleja un 50%: las piezas no se salen del cuadro
  MAX_IN_SCENE: 3,    // cada modelo usa un contexto WebGL propio: el navegador admite pocos
  RES_MAX: 2048,      // resolucion maxima del canvas al agrandar el modelo
  RES_HYSTERESIS: 0.25, // solo se re-dimensiona si la escala cambio mas que esto (y no esta agarrado)
};

// Apariencia propia de un modelo (js/three/modelLook.js): sin ella se ve holografico.
export const MODEL_LOOK = {
  SATURATION: 0.08, // max(r,g,b) - min(r,g,b) por encima de esto = color con tono
  COLOR_STEP: 0.05, // dos grises que difieren menos que esto cuentan como el mismo
};

// Mismas tasas que core/hologram.py.
export const HOLO = {
  SPIN: 0.55,          // rad/s de giro automatico
  EXPLODE_RATE: 5.0,   // suavizado exponencial de explode
  DISSOLVE_RATE: 3.2,  // suavizado exponencial de dissolve
  EXPLODE_OUT: 2.2,    // objetivo de explode al "desarmar"
};
