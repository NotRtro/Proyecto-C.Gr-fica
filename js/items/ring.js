import { registerItemType } from "./registry.js";
import { store } from "../core/store.js";
import { RING_PX, RING_COLORS } from "../core/config.js";

function drawRing(ctx, ring, size, t, name) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const color = RING_COLORS[ring.state] || RING_COLORS.idle;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.02;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.34, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  if (ring.state === "thinking") {
    ctx.lineWidth = size * 0.03;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.38, t * 2, t * 2 + Math.PI * 0.6); ctx.stroke();
  }
  if (ring.state === "speaking") {
    const amp = ring.wave && ring.wave.length
      ? ring.wave.reduce((a, b) => a + b, 0) / ring.wave.length : 0.3;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, size * (0.20 + 0.05 * amp), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "#eaf3ff";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = Math.round(size * 0.07) + "px sans-serif";
  ctx.fillText(name || "Assistant", cx, cy - size * 0.02);
  ctx.fillStyle = color;
  ctx.font = Math.round(size * 0.045) + "px sans-serif";
  ctx.fillText(ring.state || "idle", cx, cy + size * 0.09);
}

registerItemType("widget", {
  grabbable: false,
  keepOnClear: true,
  build() {
    const el = document.createElement("div");
    el.className = "ringcard";
    const canvas = document.createElement("canvas");
    canvas.width = RING_PX; canvas.height = RING_PX;
    el.appendChild(canvas);
    return { el, canvas, ctx: canvas.getContext("2d") };
  },
  update(item, dt, now) { drawRing(item.view.ctx, store.ring, RING_PX, now / 1000, store.cfg.name); },
  sync(ri, def, env) { drawRing(ri.view.ctx, env.ring, RING_PX, env.now / 1000, env.ring.name); },
});
