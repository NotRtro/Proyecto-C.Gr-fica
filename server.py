"""Servidor local de barehands: sirve stage.html, guarda el ultimo estado de
escena, encola comandos para el tracker y protege el acceso a archivos.

Solo libreria estandar. No hace fisica ni interpreta gestos: eso es
responsabilidad exclusiva del tracker (stage.html). Ver docs/07 para el
contrato completo del protocolo.
"""
from __future__ import annotations

import json
import sys
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent
STATE_DIR = REPO_ROOT / "state"

DEFAULT_CONFIG: dict[str, Any] = {
    "name": "Assistant",
    "port": 8794,
    "orbs": [
        {"title": "Notes", "path": "sample-notes", "kind": "notes"},
        {"title": "Props", "path": "media", "kind": "media"},
    ],
    "state_timeout_s": 600,
}

_ALLOWED = (
    "add_img", "add_card", "clear", "reset", "hand", "give",
    "yank", "hover", "scroll_note", "widget", "explode", "assemble",
    "present",
)

_LOCK = threading.Lock()
_STATE: dict[str, Any] = {}
_CMDS: list[dict[str, Any]] = []


def load_config() -> dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    for name in ("barehands.json", "barehands.json.example"):
        path = REPO_ROOT / name
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict):
            cfg.update(data)
            return cfg
    return cfg


def resolve_media_root(cfg: dict[str, Any]) -> Path:
    for orb in cfg.get("orbs", []):
        if isinstance(orb, dict) and orb.get("kind") == "media" and orb.get("path"):
            return (REPO_ROOT / str(orb["path"])).resolve()
    return (REPO_ROOT / "media").resolve()


CFG = load_config()
MEDIA_ROOT = resolve_media_root(CFG)


def _json_bytes(obj: Any) -> bytes:
    return json.dumps(obj).encode("utf-8")


def _read_json_body(handler: SimpleHTTPRequestHandler) -> Any:
    length = int(handler.headers.get("Content-Length", 0) or 0)
    if length <= 0:
        raise ValueError("empty body")
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


def _read_ring_state() -> dict[str, Any]:
    state_file = STATE_DIR / "state"
    mood_file = STATE_DIR / "mood.json"
    wave_file = STATE_DIR / "wave.json"

    state = "idle"
    stamp = None
    try:
        raw = state_file.read_text(encoding="utf-8").strip()
        if raw in ("idle", "listening", "thinking", "speaking"):
            state = raw
            stamp = state_file.stat().st_mtime
    except OSError:
        pass

    mood = "green"
    try:
        data = json.loads(mood_file.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("mood"), str):
            mood = data["mood"]
    except (OSError, json.JSONDecodeError):
        pass

    timeout_s = CFG.get("state_timeout_s", 600)
    if state != "idle" and stamp is not None and (time.time() - stamp) > timeout_s:
        state = "idle"

    wave: list[float] = []
    if state == "speaking":
        try:
            data = json.loads(wave_file.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("wave"), list):
                wave = [float(v) for v in data["wave"][:64]]
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass

    return {"state": state, "mood": mood, "wave": wave}


def resolve_media_src(raw: Any) -> str | None:
    """Devuelve el path relativo (posix) dentro de MEDIA_ROOT, o None si se rechaza."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    if raw.startswith("/") or raw.startswith("\\") or (len(raw) > 1 and raw[1] == ":"):
        return None  # ruta absoluta (unix o windows) rechazada de entrada

    candidate = (MEDIA_ROOT / raw).resolve()
    try:
        rel = candidate.relative_to(MEDIA_ROOT)
    except ValueError:
        rel = None
    if rel is not None and candidate.is_file():
        return rel.as_posix()

    basename = Path(raw).name
    if not basename:
        return None
    matches = [p for p in MEDIA_ROOT.rglob(basename) if p.is_file() and p.name == basename]
    if len(matches) == 1:
        return matches[0].relative_to(MEDIA_ROOT).as_posix()
    return None


class Handler(SimpleHTTPRequestHandler):

    server_version = "barehands/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:  # menos ruido en consola
        pass

    # -- utilidades de respuesta -------------------------------------------------

    def _send_json(self, obj: Any, status: int = 200) -> None:
        body = _json_bytes(obj)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status: int, error: str, detail: str = "") -> None:
        self._send_json({"error": error, "detail": detail}, status)

    # -- GET -----------------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802 (nombre requerido por http.server)
        path = urllib.parse.urlsplit(self.path).path

        if path in ("/", "/stage.html"):
            self._serve_stage_html()
            return
        if path == "/config":
            self._send_json({
                "name": CFG.get("name", "Assistant"),
                "orbs": [
                    {"title": o.get("title", ""), "kind": o.get("kind", "")}
                    for o in CFG.get("orbs", []) if isinstance(o, dict)
                ],
            })
            return
        if path == "/orb":
            self._send_json(_read_ring_state())
            return
        if path == "/state":
            with _LOCK:
                self._send_json(_STATE)
            return
        if path.startswith("/media/"):
            super().do_GET()
            return
        self.send_error(404)

    def _serve_stage_html(self) -> None:
        file_path = REPO_ROOT / "stage.html"
        try:
            body = file_path.read_bytes()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    # -- POST ------------------------------------------------------------------

    def do_POST(self) -> None:  # noqa: N802
        path = urllib.parse.urlsplit(self.path).path
        if path == "/state":
            self._handle_post_state()
            return
        if path == "/cmd":
            self._handle_post_cmd()
            return
        self.send_error(404)

    def _handle_post_state(self) -> None:
        global _STATE
        try:
            body = _read_json_body(self)
        except (ValueError, json.JSONDecodeError):
            self._send_error_json(400, "invalid_json")
            return
        if not isinstance(body, dict):
            self._send_error_json(400, "expected_object")
            return
        with _LOCK:
            _STATE = body
            delivered = _CMDS[:8]
            del _CMDS[:8]
        self._send_json({"cmds": delivered})

    def _handle_post_cmd(self) -> None:
        try:
            body = _read_json_body(self)
        except (ValueError, json.JSONDecodeError):
            self._send_error_json(400, "invalid_json")
            return
        if not isinstance(body, dict) or not isinstance(body.get("a"), str):
            self._send_error_json(400, "malformed")
            return
        if body["a"] not in _ALLOWED:
            self._send_error_json(400, "action_not_allowed", body["a"])
            return
        if "src" in body:
            resolved = resolve_media_src(body["src"])
            if resolved is None:
                self._send_error_json(400, "media_airlock_reject", str(body.get("src")))
                return
            body["src"] = resolved
        with _LOCK:
            _CMDS.append(body)
        self._send_json({"ok": True})

    # -- jaula de /media/* -------------------------------------------------------

    def translate_path(self, path: str) -> str:  # noqa: D401
        url_path = urllib.parse.urlsplit(path).path
        if url_path.startswith("/media/"):
            rel = urllib.parse.unquote(url_path[len("/media/"):])
            candidate = (MEDIA_ROOT / rel).resolve()
            try:
                candidate.relative_to(MEDIA_ROOT)
            except ValueError:
                return str(MEDIA_ROOT / "__no_existe__")
            return str(candidate)
        return str(REPO_ROOT / "__no_existe__")


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(CFG.get("port", 8794))
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"barehands escuchando en http://127.0.0.1:{port}/stage.html")
    print(f"render page (OBS):     http://127.0.0.1:{port}/stage.html?role=render")
    print(f"media root:            {MEDIA_ROOT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
