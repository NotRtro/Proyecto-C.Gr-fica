export function toVideoPx(lm, video) {
  return { x: lm.x * video.videoWidth, y: lm.y * video.videoHeight };
}

export function currentView() { return { w: innerWidth, h: innerHeight }; }

export function toScreen(lm, video, view = currentView()) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return { x: 0, y: 0 };
  const scale = Math.max(view.w / vw, view.h / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (view.w - dw) / 2, oy = (view.h - dh) / 2;
  const sx = 1 - lm.x;
  return { x: ox + sx * dw, y: oy + lm.y * dh };
}
