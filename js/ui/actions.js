// Registro de acciones de la interfaz. Un boton declara data-action="nombre"
// (y opcionalmente data-arg); al pulsarlo se ejecuta la accion registrada.
const ACTIONS = new Map();

export function registerAction(name, fn) { ACTIONS.set(name, fn); }

export function runAction(name, arg, el) {
  const fn = ACTIONS.get(name);
  if (!fn) { console.warn("[ui] accion sin registrar:", name); return; }
  try { fn(arg, el); } catch (e) { console.error("[ui] fallo la accion", name, e); }
}
