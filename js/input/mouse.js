export function createMouseInput({ onWheel }) {
  let x = 0, y = 0, used = false, pinched = false;
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
      removed: false, metrics: null,
    };
  }

  return { state, used: () => used };
}
