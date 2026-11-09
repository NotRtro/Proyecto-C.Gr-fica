import { dist } from "../core/util.js";
import { TAP, TWO_HAND, EXPLODE_DRAG, FOLLOW_LERP, HOLO, MOUSE, PALM, UI_TARGET, PIECES } from "../core/config.js";

export const MODES = { IDLE: "IDLE", GRAB: "GRAB", PIECE: "PIECE", TWO_HAND: "TWO_HAND", EXPLODE: "EXPLODE", DIAL: "DIAL", LOCKED: "LOCKED" };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function backlash(out, raw, dz) { return clamp(out, raw - dz, raw + dz); }

function edgeDistance(p, b) {
  const dx = Math.max(b.left - p.x, 0, p.x - b.right);
  const dy = Math.max(b.top - p.y, 0, p.y - b.bottom);
  return Math.hypot(dx, dy);
}

export function explodeTravel(source, spanPx) {
  if (source === "mouse" || !spanPx) return EXPLODE_DRAG.MOUSE_FULL;
  return clamp(spanPx * EXPLODE_DRAG.FULL_SPAN, EXPLODE_DRAG.FULL_MIN, EXPLODE_DRAG.FULL_MAX);
}

export function joinMargin(spanPx) {
  return clamp((spanPx || 0) * TWO_HAND.JOIN_SPAN, TWO_HAND.JOIN_MIN, TWO_HAND.JOIN_MAX);
}

export function tapTravel(source, spanPx) {
  if (source === "mouse" || !spanPx) return TAP.MOUSE_PX;
  return clamp(spanPx * TAP.TRAVEL_SPAN, TAP.MIN_PX, TAP.MAX_PX);
}

export function createArbiter(adapter) {
  const hands = new Map();
  const held = new Map();
  let session = null;
  let locked = false;

  function rec(id) {
    if (!hands.has(id)) hands.set(id, { id, role: "idle", itemId: null, ax: 0, ay: 0, kx: 0, ky: 0, trail: [] });
    return hands.get(id);
  }

  function track(r, now) {
    r.trail.push({ t: now, x: r.ax, y: r.ay });
    while (r.trail.length && r.trail[0].t < now - UI_TARGET.HISTORY_MS) r.trail.shift();
  }

  function intentPoint(r, now) {
    const pts = r.trail.filter((p) => p.t > now - UI_TARGET.INTENT_MS && p.t <= now - UI_TARGET.INTENT_SKIP_MS);
    if (!pts.length) return null;
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }

  function pieceNear(x, y, radius) {
    const hit = adapter.pieceAt(x, y);
    if (hit || radius <= 0) return hit;
    for (let ring = 1; ring <= 3; ring++) {
      const d = radius * ring / 3;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const near = adapter.pieceAt(x + Math.cos(a) * d, y + Math.sin(a) * d);
        if (near) return near;
      }
    }
    return null;
  }

  function pieceFor(r, h, now) {
    if (!adapter.pieceAt) return null;
    if (h.source === "mouse") return adapter.pieceAt(h.ax, h.ay);
    const aim = intentPoint(r, now) || { x: h.ax, y: h.ay };
    return pieceNear(aim.x, aim.y, (h.spanPx || 0) * PIECES.NEAR_SPAN) || adapter.pieceAt(h.ax, h.ay);
  }

  function hold(item, delta) {
    const n = (held.get(item.id) || 0) + delta;
    if (n <= 0) { held.delete(item.id); adapter.onGrab(item, false); }
    else { if (!held.has(item.id)) adapter.onGrab(item, true); held.set(item.id, n); }
  }

  function boundsOf(item) {
    if (adapter.boundsOf) return adapter.boundsOf(item);
    return { left: item.x, right: item.x, top: item.y, bottom: item.y };
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

  function startPiece(r, h, piece) {
    if (!adapter.beginPiece(piece.item, piece.part, h.id, h.ax, h.ay)) return false;
    r.role = "piece"; r.itemId = piece.item.id; r.part = piece.part;
    adapter.emit("piece:grab", { hand: h.id, item: piece.item, part: piece.part });
    return true;
  }

  function endPiece(r) {
    const item = adapter.findItem(r.itemId);
    const res = item ? adapter.endPiece(item, r.id) : null;
    if (item) adapter.emit("piece:drop", { hand: r.id, item, part: r.part, ...(res || {}) });
    r.role = "idle"; r.itemId = null; r.part = null;
  }

  function barOf(A, B) {
    return {
      d: Math.max(dist({ x: A.kx, y: A.ky }, { x: B.kx, y: B.ky }), 1),
      ang: Math.atan2(B.ky - A.ky, B.kx - A.kx),
      mid: { x: (A.kx + B.kx) / 2, y: (A.ky + B.ky) / 2 },
    };
  }

  function startSession(ra, rb, item) {
    ra.role = "two-hand"; rb.role = "two-hand";
    rb.itemId = item.id;
    hold(item, +1);
    const bar = barOf(ra, rb);
    session = {
      itemId: item.id, a: ra.id, b: rb.id,
      d0: bar.d, ang0: bar.ang, mid0: bar.mid,
      scale0: item.scale || 1, ry0: item.ry || 0, pos0: { x: item.x, y: item.y },
      logScale: 0, turn: 0,
    };
    item.manipulated = true;
    adapter.emit("twohand:start", { item });
  }

  function updateSession() {
    const item = adapter.findItem(session.itemId);
    if (!item) { endSession(null); return; }
    const bar = barOf(hands.get(session.a), hands.get(session.b));
    session.logScale = backlash(session.logScale, Math.log(bar.d / session.d0), TWO_HAND.SCALE_DEADZONE);
    const scale = clamp(session.scale0 * Math.exp(session.logScale), TWO_HAND.SCALE_MIN, TWO_HAND.SCALE_MAX);
    item.scale += (scale - item.scale) * FOLLOW_LERP;
    if (adapter.canRotate(item)) {
      session.turn = backlash(session.turn, wrapAngle(bar.ang - session.ang0), TWO_HAND.ROT_DEADZONE);
      item.ry = session.ry0 + session.turn;
    }
    const tx = session.pos0.x + bar.mid.x - session.mid0.x, ty = session.pos0.y + bar.mid.y - session.mid0.y;
    item.x += (tx - item.x) * FOLLOW_LERP;
    item.y += (ty - item.y) * FOLLOW_LERP;
    adapter.onMoved(item);
  }

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

  function onPinchStart(h, r, now) {
    r.pinchT = now;
    r.start = { x: h.ax, y: h.ay };
    r.tapTravel = tapTravel(h.source, h.spanPx);
    r.exFull = explodeTravel(h.source, h.spanPx);
    adapter.emit("cursor:pinch-start", { hand: h.id, x: h.ax, y: h.ay, source: h.source, spanPx: h.spanPx });
    if (locked) { r.role = "locked"; return; }
    if (adapter.isUiAt && adapter.isUiAt(h.ax, h.ay)) { r.role = "ui"; return; }

    const piece = pieceFor(r, h, now);
    if (piece && startPiece(r, h, piece)) return;

    const item = adapter.hitTest(h.ax, h.ay);
    const holder = [...hands.values()].find((o) => o !== r && o.role === "grab");
    if (holder && !session) {
      const hItem = adapter.findItem(holder.itemId);
      const near = hItem && (item === hItem ||
        (!item && edgeDistance({ x: h.ax, y: h.ay }, boundsOf(hItem)) <= joinMargin(h.spanPx)));
      if (near) { startSession(holder, r, hItem); return; }
    }
    if (item && !held.has(item.id)) startGrab(r, item);
    else if (item || holder || session) r.role = "none";
    else r.role = "explode-pending";
  }

  function onPinchHold(h, r) {
    if (r.role === "piece") {
      const item = adapter.findItem(r.itemId);
      if (!item) { r.role = "none"; r.itemId = null; return; }
      adapter.movePiece(item, h.id, h.ax, h.ay);
    } else if (r.role === "grab") {
      const item = adapter.findItem(r.itemId);
      if (!item) { release(r); return; }
      const tx = h.ax + r.offset.x, ty = h.ay + r.offset.y;
      item.x += (tx - item.x) * FOLLOW_LERP;
      item.y += (ty - item.y) * FOLLOW_LERP;
      adapter.onMoved(item);
    } else if (r.role === "explode-pending") {
      const dx = h.ax - r.start.x, dy = h.ay - r.start.y;
      if (Math.abs(dx) >= r.tapTravel && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        const target = adapter.findExplodable();
        if (!target) { r.role = "none"; return; }
        r.role = "explode"; r.itemId = target.id;
        r.exStartX = r.start.x + Math.sign(dx) * r.tapTravel;
        r.ex0 = target.explodeTarget || 0;
        adapter.emit("explode:start", { item: target });
      } else if (Math.abs(dy) >= r.tapTravel) {
        r.role = "none";
      }
    }
    if (r.role === "explode") {
      const item = adapter.findItem(r.itemId);
      if (!item) { r.role = "none"; r.itemId = null; return; }
      const f = (h.ax - r.exStartX) / r.exFull;
      item.explodeTarget = clamp(r.ex0 + f * HOLO.EXPLODE_OUT, 0, HOLO.EXPLODE_OUT);
    }
  }

  function onPinchEnd(h, r, now, allowTap) {
    const quick = now - r.pinchT < TAP.MAX_MS;
    const still = dist(r.start, { x: h.ax, y: h.ay }) < r.tapTravel;
    const tappable = r.role !== "two-hand" && r.role !== "explode" && r.role !== "piece";
    if (allowTap && tappable && quick && still) {
      const item = locked || r.role === "ui" ? null : adapter.hitTest(r.start.x, r.start.y);
      if (item) adapter.onTap(item);
      adapter.emit("cursor:tap", { hand: h.id, item, x: r.start.x, y: r.start.y });
    }
    if (session && (session.a === r.id || session.b === r.id)) endSession(r.id);
    else if (r.role === "explode") { r.role = "idle"; r.itemId = null; }
    else if (r.role === "piece") endPiece(r);
    else release(r);
    r.role = "idle";
    adapter.emit("cursor:pinch-end", { hand: h.id, x: h.ax, y: h.ay, removed: !!h.removed });
  }

  function palmTarget(p) {
    const it = adapter.hitTest(p.x, p.y);
    return it && adapter.canRotate(it) ? it : adapter.findExplodable();
  }

  function endDial(r) {
    const item = r.dial && adapter.findItem(r.dial.itemId);
    r.dial = null;
    if (item) adapter.emit("palm:dial-end", { hand: r.id, item });
  }

  function onPalm(h, r) {
    const p = h.palm;
    const onUi = p && adapter.isUiAt && adapter.isUiAt(p.x, p.y);
    if (!p || onUi || locked || h.pinched || r.role !== "idle") { if (r.dial) endDial(r); return; }
    if (p.fired) {
      const item = palmTarget(p);
      if (item) {
        item.spinPaused = !item.spinPaused;
        adapter.emit("palm:stop", { hand: h.id, item, paused: item.spinPaused });
      }
    }
    if (p.pose !== "dial") { if (r.dial) endDial(r); return; }
    if (!r.dial) {
      const item = palmTarget(p);
      if (!item || !adapter.canRotate(item)) return;
      item.spinPaused = true;
      r.dial = { itemId: item.id, angle0: p.angle0, ry0: item.ry || 0, turn: 0 };
      adapter.emit("palm:dial-start", { hand: h.id, item });
    }
    const item = adapter.findItem(r.dial.itemId);
    if (!item) { r.dial = null; return; }
    r.dial.turn = backlash(r.dial.turn, wrapAngle(p.angle - r.dial.angle0), PALM.DIAL_DEADZONE);
    item.ry += (r.dial.ry0 + r.dial.turn * PALM.DIAL_GAIN - item.ry) * FOLLOW_LERP;
    adapter.onMoved(item);
  }

  function update(states, now) {
    for (const h of states) {
      const r = rec(h.id);
      if (h.present || h.removed) {
        r.ax = h.ax; r.ay = h.ay;
        r.kx = h.kx ?? h.ax; r.ky = h.ky ?? h.ay;
        if (h.present) track(r, now);
      }
      if (h.pinchChanged === "start") onPinchStart(h, r, now);
      if (h.pinched && h.present && h.pinchChanged !== "end") onPinchHold(h, r);
      if (h.pinchChanged === "end") onPinchEnd(h, r, now, !h.removed);
      if (h.present && !h.removed) onPalm(h, r);
      else if (r.dial) endDial(r);
      if (h.removed) hands.delete(h.id);
    }
    if (session) updateSession();
  }

  function wheel(x, y, deltaY, rotate) {
    if (locked) return;
    const item = adapter.hitTest(x, y);
    if (!item) return;
    if (rotate && adapter.canRotate(item)) item.ry = (item.ry || 0) + deltaY * MOUSE.WHEEL_ROTATE;
    else item.scale = clamp((item.scale || 1) * Math.exp(-deltaY * MOUSE.WHEEL_SCALE),
      TWO_HAND.SCALE_MIN, TWO_HAND.SCALE_MAX);
    adapter.onMoved(item);
  }

  function releaseAll() {
    if (session) endSession(null);
    for (const r of hands.values()) {
      if (r.role === "grab") release(r);
      if (r.role === "piece") endPiece(r);
      if (r.role !== "idle") r.role = locked ? "locked" : "none";
      r.itemId = null;
    }
    held.clear();
  }

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
    if (roles.includes("piece")) return MODES.PIECE;
    if (roles.includes("grab")) return MODES.GRAB;
    if ([...hands.values()].some((r) => r.dial)) return MODES.DIAL;
    return MODES.IDLE;
  }

  function roleOf(id) { return hands.has(id) ? hands.get(id).role : "idle"; }

  return { update, wheel, releaseAll, reset, setLocked, isLocked: () => locked, mode, roleOf };
}
