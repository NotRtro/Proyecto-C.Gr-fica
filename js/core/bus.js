// Bus de eventos minimo. Permite que modulos futuros (menu, ayuda, arbitro de
// gestos) reaccionen a lo que pasa sin que el nucleo los conozca.
//
// Eventos emitidos hoy (hand = ID de la mano: "h1", "h2"... o "mouse"):
//   item:added          item
//   item:removed        item
//   cursor:pinch-start  { hand, x, y }
//   cursor:pinch-end    { hand }
//   cursor:tap          { hand, item, x, y }   (item null si no habia nada o el arbitro esta bloqueado)
//   grab:start          { hand, item }
//   grab:end            { hand, item }
//   twohand:start       { item }
//   twohand:end         { item }
//   explode:start       { item }
//   gesture:palm        { hand, handedness }   (palma abierta sostenida)
//   arbiter:locked      { locked }
const handlers = new Map();

export function on(evt, fn) {
  if (!handlers.has(evt)) handlers.set(evt, new Set());
  handlers.get(evt).add(fn);
  return () => off(evt, fn);
}

export function off(evt, fn) {
  const set = handlers.get(evt);
  if (set) set.delete(fn);
}

export function emit(evt, payload) {
  const set = handlers.get(evt);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(payload); } catch (e) { console.error("[bus] error en handler de", evt, e); }
  }
}
