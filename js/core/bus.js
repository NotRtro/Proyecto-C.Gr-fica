// Bus de eventos minimo. Permite que modulos futuros (menu, ayuda, arbitro de
// gestos) reaccionen a lo que pasa sin que el nucleo los conozca.
//
// Eventos emitidos hoy:
//   item:added    item
//   item:removed  item
//   cursor:pinch-start  { cursor }
//   cursor:pinch-end    { cursor }
//   cursor:tap          { cursor, item }   (item puede ser null)
//   grab:start          { cursor, item }
//   grab:end            { cursor, item }
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
