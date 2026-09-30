// Arbitro de gestos: decide que hace cada pinch segun el MODO actual, para que
// los gestos no se pisen entre si. Es puro: todo lo que toca la escena pasa por
// el `adapter` inyectado (DOM en el navegador, objetos falsos en los tests).
//
// Roles por mano:
//   idle             sin pinch
//   grab             arrastra un item (offset preservado, sin salto al centro)
//   two-hand         junto con otra mano escala/rota/mueve un item
//   explode-pending  pinch en vacio: todavia no se sabe si es un arrastre horizontal
//   explode          pinch en vacio + arrastre horizontal = explode/assemble
//   none             pinch sin efecto (vertical en vacio, o sobra una mano)
//   locked           el arbitro esta bloqueado (menu abierto, fase 5)
//
// adapter = {
//   hitTest(x, y) -> item | null     findItem(id) -> item | null
//   findExplodable() -> item | null  canRotate(item) -> bool
//   onMoved(item)   onGrab(item, on)   onTap(item)   emit(evento, payload)
// }
// Los items son objetos con x, y (px), scale, ry y, si explotan, explodeTarget.
import { dist } from "../core/util.js";
import { TAP, TWO_HAND, EXPLODE_DRAG, FOLLOW_LERP, HOLO, MOUSE } from "../core/config.js";

export const MODES = { IDLE: "IDLE", GRAB: "GRAB", TWO_HAND: "TWO_HAND", EXPLODE: "EXPLODE", LOCKED: "LOCKED" };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function deadzone(a, dz) { return Math.sign(a) * Math.max(0, Math.abs(a) - dz); }

export function createArbiter(adapter) {
  const hands = new Map();   // id -> registro de la mano
  const held = new Map();    // itemId -> cuantas manos lo sostienen
  let session = null;        // manipulacion a dos manos
  let locked = false;

  function rec(id) {
    if (!hands.has(id)) hands.set(id, { id, role: "idle", itemId: null, ax: 0, ay: 0 });
    return hands.get(id);
  }

  function hold(item, delta) {
    const n = (held.get(item.id) || 0) + delta;
    if (n <= 0) { held.delete(item.id); adapter.onGrab(item, false); }
    else { if (!held.has(item.id)) adapter.onGrab(item, true); held.set(item.id, n); }
  }

  function startGrab(r, item) {
    r.role = "grab"; r.itemId = item.id;
    r.offset = { x: item.x - r.ax, y: item.y - r.ay };
    hold(item, +1);
    adapter.emit("grab:start", { hand: r.id, item });
  }

  function release(r) {
    if (r.itemId) {
      const item = adapter.findItem(r.itemId);
      if (item) { hold(item, -1); adapter.emit("grab:end", { hand: r.id, item }); }
      else held.delete(r.itemId);
    }
    r.role = "idle"; r.itemId = null;
  }

  // ---- dos manos ----------------------------------------------------------

  function startSession(ra, rb, item) {
    ra.role = "two-hand"; rb.role = "two-hand";
    rb.itemId = item.id;
    hold(item, +1);
    session = {
      itemId: item.id, a: ra.id, b: rb.id,
      d0: Math.max(dist({ x: ra.ax, y: ra.ay }, { x: rb.ax, y: rb.ay }), 1),
      ang0: Math.atan2(rb.ay - ra.ay, rb.ax - ra.ax),
      mid0: { x: (ra.ax + rb.ax) / 2, y: (ra.ay + rb.ay) / 2 },
      scale0: item.scale || 1, ry0: item.ry || 0, pos0: { x: item.x, y: item.y },
    };
    item.manipulated = true;
    adapter.emit("twohand:start", { item });
  }

  function updateSession() {
    const item = adapter.findItem(session.itemId);
    if (!item) { endSession(null); return; }
    const A = hands.get(session.a), B = hands.get(session.b);
    const d = dist({ x: A.ax, y: A.ay }, { x: B.ax, y: B.ay });
    const scale = clamp(session.scale0 * d / session.d0, TWO_HAND.SCALE_MIN, TWO_HAND.SCALE_MAX);
    item.scale += (scale - item.scale) * FOLLOW_LERP;
    if (adapter.canRotate(item)) {
      const dAng = wrapAngle(Math.atan2(B.ay - A.ay, B.ax - A.ax) - session.ang0);
      item.ry = session.ry0 + deadzone(dAng, TWO_HAND.ROT_DEADZONE);
    }
    const mid = { x: (A.ax + B.ax) / 2, y: (A.ay + B.ay) / 2 };
    const tx = session.pos0.x + mid.x - session.mid0.x, ty = session.pos0.y + mid.y - session.mid0.y;
    item.x += (tx - item.x) * FOLLOW_LERP;
    item.y += (ty - item.y) * FOLLOW_LERP;
    adapter.onMoved(item);
  }

  // Termina la sesion; la mano que sigue con pinch continua arrastrando sola.
  function endSession(leavingId) {
    const s = session;
    session = null;
    const item = adapter.findItem(s.itemId);
    if (item) { item.manipulated = false; adapter.emit("twohand:end", { item }); }
    else held.delete(s.itemId);
    for (const id of [s.a, s.b]) {
      const r = hands.get(id);
      if (!r) continue;
      if (id !== leavingId && item && leavingId !== null) {
        r.role = "grab"; r.itemId = item.id;
        r.offset = { x: item.x - r.ax, y: item.y - r.ay };
      } else {
        if (item && r.itemId) hold(item, -1);
        r.role = id === leavingId ? "idle" : "none"; r.itemId = null;
      }
    }
  }

  // ---- ciclo de un pinch --------------------------------------------------

  function onPinchStart(h, r, now) {
    r.pinchT = now;
    r.start = { x: h.ax, y: h.ay };
    adapter.emit("cursor:pinch-start", { hand: h.id, x: h.ax, y: h.ay });
    if (locked) { r.role = "locked"; return; }

    const item = adapter.hitTest(h.ax, h.ay);
    const holder = [...hands.values()].find((o) => o !== r && o.role === "grab");
    if (holder && !session) {
      const hItem = adapter.findItem(holder.itemId);
      const near = hItem && (item === hItem ||
        (!item && dist({ x: h.ax, y: h.ay }, hItem) <= TWO_HAND.JOIN_PX));
      if (near) { startSession(holder, r, hItem); return; }
    }
    if (item && !held.has(item.id)) startGrab(r, item);
    else if (item || holder || session) r.role = "none";
    else r.role = "explode-pending";
  }

  function onPinchHold(h, r) {
    if (r.role === "grab") {
      const item = adapter.findItem(r.itemId);
      if (!item) { release(r); return; }
      const tx = h.ax + r.offset.x, ty = h.ay + r.offset.y;
      item.x += (tx - item.x) * FOLLOW_LERP;
      item.y += (ty - item.y) * FOLLOW_LERP;
      adapter.onMoved(item);
    } else if (r.role === "explode-pending") {
      const dx = h.ax - r.start.x, dy = h.ay - r.start.y;
      if (Math.abs(dx) >= EXPLODE_DRAG.START_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        const target = adapter.findExplodable();
        if (!target) { r.role = "none"; return; }
        r.role = "explode"; r.itemId = target.id;
        // Solo se "gasta" el umbral de decision; el resto del recorrido ya cuenta
        // (un movimiento rapido de mouse puede cruzar el umbral en un solo frame).
        r.exStartX = r.start.x + Math.sign(dx) * EXPLODE_DRAG.START_PX;
        r.ex0 = target.explodeTarget || 0;
        adapter.emit("explode:start", { item: target });
      } else if (Math.abs(dy) >= EXPLODE_DRAG.START_PX) {
        r.role = "none";
      }
    }
    if (r.role === "explode") {
      const item = adapter.findItem(r.itemId);
      if (!item) { r.role = "none"; r.itemId = null; return; }
      const f = (h.ax - r.exStartX) / EXPLODE_DRAG.PX_FULL;
      item.explodeTarget = clamp(r.ex0 + f * HOLO.EXPLODE_OUT, 0, HOLO.EXPLODE_OUT);
    }
  }

  function onPinchEnd(h, r, now, allowTap) {
    const quick = now - r.pinchT < TAP.MAX_MS;
    const still = dist(r.start, { x: h.ax, y: h.ay }) < TAP.MAX_PX;
    const tappable = r.role !== "two-hand" && r.role !== "explode";
    if (allowTap && tappable && quick && still) {
      const item = locked ? null : adapter.hitTest(r.start.x, r.start.y);
      if (item) adapter.onTap(item);
      adapter.emit("cursor:tap", { hand: h.id, item, x: r.start.x, y: r.start.y });
    }
    if (session && (session.a === r.id || session.b === r.id)) endSession(r.id);
    else if (r.role === "explode") { r.role = "idle"; r.itemId = null; }
    else release(r);
    r.role = "idle";
    adapter.emit("cursor:pinch-end", { hand: h.id });
  }

  // ---- API ----------------------------------------------------------------

  // states: estados de mano (gestures.js) y/o del mouse. Llamar una vez por frame.
  function update(states, now) {
    for (const h of states) {
      const r = rec(h.id);
      if (h.present || h.removed) { r.ax = h.ax; r.ay = h.ay; }
      if (h.pinchChanged === "start") onPinchStart(h, r, now);
      if (h.pinched && h.present && h.pinchChanged !== "end") onPinchHold(h, r);
      if (h.pinchChanged === "end") onPinchEnd(h, r, now, !h.removed);
      if (h.palmFired) adapter.emit("gesture:palm", { hand: h.id, handedness: h.handedness });
      if (h.removed) hands.delete(h.id);
    }
    if (session) updateSession();
  }

  // Rueda del mouse sobre un item: escala; con Shift rota (si el item rota).
  function wheel(x, y, deltaY, rotate) {
    if (locked) return;
    const item = adapter.hitTest(x, y);
    if (!item) return;
    if (rotate && adapter.canRotate(item)) item.ry = (item.ry || 0) + deltaY * MOUSE.WHEEL_ROTATE;
    else item.scale = clamp((item.scale || 1) * Math.exp(-deltaY * MOUSE.WHEEL_SCALE),
      TWO_HAND.SCALE_MIN, TWO_HAND.SCALE_MAX);
    adapter.onMoved(item);
  }

  // Suelta todo (clear/reset, o al bloquear). Los pinch en curso quedan sin efecto.
  function releaseAll() {
    if (session) endSession(null);
    for (const r of hands.values()) {
      if (r.role === "grab") release(r);
      if (r.role !== "idle") r.role = locked ? "locked" : "none";
      r.itemId = null;
    }
    held.clear();
  }

  // Olvida todas las manos (reinicio de la tuberia, p. ej. al repetir una grabacion).
  function reset() { releaseAll(); hands.clear(); }

  function setLocked(v) {
    if (v === locked) return;
    locked = v;
    releaseAll();
    adapter.emit("arbiter:locked", { locked });
  }

  function mode() {
    if (locked) return MODES.LOCKED;
    if (session) return MODES.TWO_HAND;
    const roles = [...hands.values()].map((r) => r.role);
    if (roles.includes("explode")) return MODES.EXPLODE;
    if (roles.includes("grab")) return MODES.GRAB;
    return MODES.IDLE;
  }

  function roleOf(id) { return hands.has(id) ? hands.get(id).role : "idle"; }

  return { update, wheel, releaseAll, reset, setLocked, isLocked: () => locked, mode, roleOf };
}
