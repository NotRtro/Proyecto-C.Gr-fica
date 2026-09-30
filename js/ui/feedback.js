// Avisos no bloqueantes (toasts) y pantalla de fin de sesion.

function toastLayer() {
  let el = document.getElementById("toasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "toasts";
    document.body.appendChild(el);
  }
  return el;
}

// kind: "info" | "error". ms = 0 deja el aviso fijo (p. ej. "sin camara").
export function toast(text, { ms = 2600, kind = "info" } = {}) {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = text;
  toastLayer().appendChild(el);
  requestAnimationFrame(() => el.classList.add("visible"));
  if (ms > 0) {
    setTimeout(() => {
      el.classList.remove("visible");
      setTimeout(() => el.remove(), 300);
    }, ms);
  }
  return el;
}

// Se muestra tras "Salir": la camara ya esta apagada y el loop detenido, asi que
// este boton usa un click nativo del mouse (no hay gestos).
export function showEndScreen() {
  const el = document.createElement("div");
  el.id = "endscreen";
  el.innerHTML =
    '<div class="end-card"><div class="end-title">Sesión terminada</div>' +
    '<p>La cámara está apagada y la escena se liberó. Ya puedes cerrar esta pestaña.</p>' +
    '<button class="ui-btn primary" type="button">Reanudar</button></div>';
  el.querySelector("button").addEventListener("click", () => location.reload());
  document.body.appendChild(el);
}

// Click sonoro corto (docs/14 M7), sin archivos de audio: un "blip" de 25 ms
// generado con WebAudio. Solo suena si esta activado en Ajustes. Nota: los
// navegadores no permiten audio hasta que hubo una interaccion REAL (tecla o
// click del mouse); con solo gestos de mano puede quedar en silencio hasta entonces.
let audio = null;
export function playClick() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.025);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.035);
  } catch (e) { /* sin audio disponible: se ignora */ }
}
