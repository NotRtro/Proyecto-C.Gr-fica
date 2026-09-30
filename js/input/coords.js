// Conversion de landmarks normalizados de MediaPipe (0..1 del video) a pixeles.

export function toVideoPx(lm, video) {
  return { x: lm.x * video.videoWidth, y: lm.y * video.videoHeight };
}

// Corrige object-fit:cover (el video se escala y recorta para llenar la ventana)
// y aplica el espejo de self-view del tracker.
export function toScreen(lm, video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return { x: 0, y: 0 };
  const scale = Math.max(innerWidth / vw, innerHeight / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (innerWidth - dw) / 2, oy = (innerHeight - dh) / 2;
  const sx = 1 - lm.x; // espejo self-view del tracker
  return { x: ox + sx * dw, y: oy + lm.y * dh };
}
