// Mouse como "mano virtual": boton izquierdo = pinch. Produce el mismo estado de
// mano que gestures.js, asi que agarrar, arrastrar, tap y explode (arrastre
// horizontal en vacio) funcionan sin camara. Rueda = escalar, Shift+rueda = rotar.
export function createMouseInput({ onWheel }) {
  let x = 0, y = 0, used = false, pinched = false;
  // Transiciones pendientes con la posicion donde ocurrieron: un click rapido
  // dentro de un mismo frame no se pierde, y el pinch empieza donde se hizo click
  // aunque el mouse ya se haya movido antes de que corra el frame.
  const queue = [];

  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; used = true; });
  addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    x = e.clientX; y = e.clientY; used = true;
    queue.push({ down: true, x, y });
  });
  addEventListener("pointerup", (e) => { if (e.button === 0) queue.push({ down: false, x: e.clientX, y: e.clientY }); });
  addEventListener("blur", () => queue.push({ down: false, x, y }));
  addEventListener("wheel", (e) => { if (onWheel) onWheel(e.clientX, e.clientY, e.deltaY, e.shiftKey); });
  // Evita el drag-and-drop nativo de imagenes al arrastrar con el mouse.
  addEventListener("dragstart", (e) => e.preventDefault());

  function state() {
    let change = null, ax = x, ay = y;
    while (queue.length) {
      const ev = queue.shift();
      if (ev.down !== pinched) {
        pinched = ev.down; change = ev.down ? "start" : "end";
        ax = ev.x; ay = ev.y;
        break;
      }
    }
    return {
      id: "mouse", source: "mouse", handedness: "mouse", present: true,
      x, y, ax, ay, pinched, pinchChanged: change,
      palmProgress: 0, palmFired: false, removed: false, metrics: null,
    };
  }

  return { state, used: () => used };
}
