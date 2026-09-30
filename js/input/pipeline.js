// Tuberia de entrada completa: detecciones -> manos con ID -> estados de gesto
// -> arbitro. La usan igual el tracker (camara o grabacion) y los tests de Node.
import { createHandTracker } from "./hands.js";
import { createGestureEngine } from "./gestures.js";
import { createArbiter } from "./arbiter.js";

export function createInputPipeline(adapter) {
  const tracker = createHandTracker();
  const engine = createGestureEngine();
  const arbiter = createArbiter(adapter);
  let handStates = [];

  // detections: arreglo si hay un frame NUEVO de camara, null si no (el arbitro
  // igual corre para que el arrastre siga suave a la tasa de pantalla).
  // extra: estados adicionales ya armados (el mouse).
  function step({ detections, video, now, view, extra = [] }) {
    handStates = detections ? engine.update(tracker.update(detections, now), video, now, view) : engine.repeat();
    arbiter.update(extra.length ? handStates.concat(extra) : handStates, now);
    return handStates;
  }

  function reset() { tracker.reset(); engine.reset(); arbiter.reset(); handStates = []; }

  return { step, reset, arbiter, hands: () => handStates };
}
