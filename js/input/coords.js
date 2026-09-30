// Conversion de landmarks normalizados de MediaPipe (0..1 del video) a pixeles.
// `video` puede ser el <video> real o cualquier objeto {videoWidth, videoHeight}
// (grabaciones, tests). `view` es el tamano de la ventana; por defecto la real.

export function toVideoPx(lm, video) {
  return { x: lm.x * video.videoWidth, y: lm.y * video.videoHeight };
}

export function currentView() { return { w: innerWidth, h: innerHeight }; }

// Corrige object-fit:cover (el video se escala y recorta para llenar la ventana)
// y aplica el espejo de self-view del tracker.
export function toScreen(lm, video, view = currentView()) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return { x: 0, y: 0 };
  const scale = Math.max(view.w / vw, view.h / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (view.w - dw) / 2, oy = (view.h - dh) / 2;
  const sx = 1 - lm.x; // espejo self-view del tracker
  return { x: ox + sx * dw, y: oy + lm.y * dh };
}
