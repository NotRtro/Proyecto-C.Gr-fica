// Bus de eventos minimo. Permite que modulos futuros (menu, ayuda, arbitro de
// gestos) reaccionen a lo que pasa sin que el nucleo los conozca.
//
// Eventos emitidos hoy (hand = ID de la mano: "h1", "h2"... o "mouse"):
//   item:added          item
//   item:removed        item
//   cursor:pinch-start  { hand, x, y, source, spanPx }   (source "hand"|"mouse"; spanPx = tamano de la mano)
//   cursor:pinch-end    { hand, x, y, removed }
//   cursor:tap          { hand, item, x, y }   (item null si no habia nada o el arbitro esta bloqueado)
//   grab:start          { hand, item }
//   grab:end            { hand, item }
//   twohand:start       { item }
//   twohand:end         { item }
//   explode:start       { item }
//   piece:grab          { hand, item, part }     (fase 7C: se tomo una pieza de un modelo desarmado)
//   piece:drop          { hand, item, part, label, snapped, placed, total }   (7D: snapped = encajo)
//   model:assembled     { item }                 (todas las piezas encajadas: el modelo se arma)
//   palm:stop           { hand, item, paused }   (palma de "alto": se detuvo / reanudo el giro)
//   palm:dial-start     { hand, item }           (palma "perilla": empieza a girar el modelo)
//   palm:dial-end       { hand, item }
//   model:loaded        { item, stats }   model:error { item, error }
//   arbiter:locked      { locked }
//   menu:open           { page }
//   menu:close          {}
//   settings:changed    { key, value }
//   hud:toggle          {}        (pedido de mostrar/ocultar el panel de depuracion)
//   app:exit            {}        (pedido de terminar la sesion; lo atiende el tracker)
//   ui:click            { hand, action }   (se pulso un boton de la interfaz)
//   ui:drag             { id }    (se esta moviendo el orbe o el panel)
//   ui:dragged          { id }    (se solto el orbe o el panel en su nuevo lugar)
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
