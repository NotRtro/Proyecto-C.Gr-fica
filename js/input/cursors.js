// Cursores de mano: un cursor por mano detectada. Traduce pinch -> agarrar,
// arrastrar, soltar y tap. La fase 4 separa esto en reconocedores + arbitro.
import { store } from "../core/store.js";
import { emit } from "../core/bus.js";
import { dist, midpoint } from "../core/util.js";
import { TAP, FOLLOW_LERP } from "../core/config.js";
import { stageLayer, applyTransform, findItem, getItemType, isGrabbable } from "../items/registry.js";
import { toScreen } from "./coords.js";
import { pinchMetrics, pinchTransition } from "./pinch.js";

export function hitTest(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const item = store.items.find((it) => isGrabbable(it) && (it.el === el || it.el.contains(el)));
    if (item) return item;
  }
  return null;
}

function createCursor(label) {
  const el = document.createElement("div");
  el.className = "cursor";
  stageLayer().appendChild(el);
  return { label, el, x: 0, y: 0, pinched: false, pinchStart: 0, startPos: { x: 0, y: 0 },
    grabbedItemId: null, offset: { x: 0, y: 0 }, metrics: null };
}

function beginGrab(cur, item) {
  cur.grabbedItemId = item.id;
  cur.offset = { x: item.x - cur.x, y: item.y - cur.y };
  item.el.classList.add("grabbed");
  emit("grab:start", { cursor: cur, item });
}

export function endGrab(cur) {
  if (cur.grabbedItemId) {
    const it = findItem(cur.grabbedItemId);
    if (it) it.el.classList.remove("grabbed");
    emit("grab:end", { cursor: cur, item: it || null });
  }
  cur.grabbedItemId = null;
}

function positionCursorEl(cur) {
  cur.el.style.transform = "translate(-50%,-50%) translate(" + cur.x + "px," + cur.y + "px)";
  cur.el.classList.toggle("pinched", cur.pinched);
}

export function updateCursorsFromHandResults(res, video, now) {
  const cursors = store.cursors;
  const seen = new Set();
  const hands = res.landmarks || [];
  const handedness = res.handedness || [];
  for (let i = 0; i < hands.length; i++) {
    const lm = hands[i];
    const label = (handedness[i] && handedness[i][0] && handedness[i][0].categoryName) || ("hand" + i);
    seen.add(label);
    let cur = cursors[label];
    if (!cur) cur = cursors[label] = createCursor(label);

    const m = pinchMetrics(lm, video);
    const wasPinched = cur.pinched;
    cur.pinched = pinchTransition(cur.pinched, m);
    cur.metrics = m;

    const pos = midpoint(toScreen(lm[8], video), toScreen(lm[4], video));
    cur.x = pos.x; cur.y = pos.y;

    if (!wasPinched && cur.pinched) {
      cur.pinchStart = now;
      cur.startPos = { x: cur.x, y: cur.y };
      emit("cursor:pinch-start", { cursor: cur });
      const hit = hitTest(cur.x, cur.y);
      if (hit) beginGrab(cur, hit);
    }

    if (cur.grabbedItemId) {
      const item = findItem(cur.grabbedItemId);
      if (item) {
        const tx = cur.x + cur.offset.x, ty = cur.y + cur.offset.y;
        item.x += (tx - item.x) * FOLLOW_LERP;
        item.y += (ty - item.y) * FOLLOW_LERP;
        applyTransform(item);
      }
    }

    if (wasPinched && !cur.pinched) {
      const duration = now - cur.pinchStart;
      const travel = dist(cur.startPos, { x: cur.x, y: cur.y });
      if (duration < TAP.MAX_MS && travel < TAP.MAX_PX) {
        const hit = hitTest(cur.startPos.x, cur.startPos.y);
        if (hit) {
          const T = getItemType(hit.type);
          if (T && T.onTap) T.onTap(hit);
        }
        emit("cursor:tap", { cursor: cur, item: hit });
      }
      emit("cursor:pinch-end", { cursor: cur });
      endGrab(cur);
    }

    positionCursorEl(cur);
  }
  for (const label of Object.keys(cursors)) {
    if (!seen.has(label)) {
      endGrab(cursors[label]);
      cursors[label].el.remove();
      delete cursors[label];
    }
  }
}
