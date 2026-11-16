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
JS_ROOT = (REPO_ROOT / "js").resolve()
CSS_ROOT = (REPO_ROOT / "css").resolve()
RECORDINGS_ROOT = (REPO_ROOT / "tests" / "recordings").resolve()

_JS_TYPES = {".js": "text/javascript; charset=utf-8"}
_JSON_TYPES = {".json": "application/json; charset=utf-8"}
_CSS_TYPES = {".css": "text/css; charset=utf-8"}

_STATIC_ROUTES = {
    "/js/": (JS_ROOT, _JS_TYPES),
    "/css/": (CSS_ROOT, _CSS_TYPES),
    "/recordings/": (RECORDINGS_ROOT, _JSON_TYPES),
}

DEFAULT_CONFIG: dict[str, Any] = {
    "name": "HeyTECHI",
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
    "load_model", "remove_model",
    "guide", "place_piece",
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


MODEL_EXTS = (".glb", ".gltf")
MODELS_DIR = "models"
INFO_CATALOG = next(
    (p for p in (MEDIA_ROOT / "info" / "catalogo.json", MEDIA_ROOT / "Info" / "catalogo.json") if p.is_file()),
    MEDIA_ROOT / "info" / "catalogo.json",
)
GENERAL_INFO_CATALOG = INFO_CATALOG.with_name("contenido_general.json")
VERIFIED_INFO_CATALOG = INFO_CATALOG.with_name("contenido_anatomico_completo.json")


def _load_json_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _model_manifest_path(model: Path) -> Path:
    return model.parent / "manifest.json" if model.stem.lower() == "model" else model.with_suffix(".json")


def _model_entry(model: Path, root: Path) -> dict[str, Any]:
    manifest = _load_json_object(_model_manifest_path(model))
    default_name = model.parent.name if model.stem.lower() == "model" else model.stem
    parent = model.parent.relative_to(root)
    return {
        "id": model.relative_to(root).as_posix(),
        "name": str(manifest.get("name") or default_name),
        "src": model.relative_to(MEDIA_ROOT).as_posix(),
        "bytes": model.stat().st_size,
        "manifest": manifest,
        "folder": "" if parent == Path(".") else parent.as_posix(),
    }


def list_models() -> list[dict[str, Any]]:
    root = MEDIA_ROOT / MODELS_DIR
    if not root.is_dir():
        return []
    models = (
        model for model in root.rglob("*")
        if model.is_file()
        and model.suffix.lower() in MODEL_EXTS
        and not any(part.startswith(".") for part in model.relative_to(root).parts)
    )
    return [_model_entry(model, root) for model in sorted(models, key=lambda path: path.as_posix().lower())]


class AnatomyCatalog:
    def __init__(self, path: Path, general_path: Path, verified_path: Path | None = None):
        self.path = path
        self.general_path = general_path
        self.verified_path = verified_path
        self.stamp: tuple[float | None, float | None, float | None] | None = None
        self.by_id: dict[str, dict[str, Any]] = {}
        self.by_name: dict[str, list[dict[str, Any]]] = {}
        self.general_by_model: dict[str, dict[str, Any]] = {}
        self.verified_by_id: dict[str, dict[str, Any]] = {}

    def find(self, piece_id: str = "", mesh_name: str = "", model_src: str = "") -> dict[str, Any] | None:
        self._refresh()
        matches: list[dict[str, Any]] = []
        if piece_id.startswith("za_"):
            info = self.by_id.get(piece_id)
        else:
            matches = self.by_name.get(mesh_name, [])
            info = matches[0] if matches else None
        info = self._with_verified_context(info)
        if info and not self._has_content(info):
            context = next((candidate for candidate in matches if self._has_content(candidate)), None)
            if context:
                info = self._merge_context(info, context, str(context.get("nombre_es") or "estructura anatómica"))
        info = self._with_general_context(info, model_src)
        return self._with_structural_context(info)

    def _with_verified_context(self, info: dict[str, Any] | None) -> dict[str, Any] | None:
        if not info:
            return None
        verified = self.verified_by_id.get(str(info.get("id") or ""))
        if not verified:
            return info
        merged = {**info, **verified}
        merged["fuentes"] = list(dict.fromkeys([*info.get("fuentes", []), *verified.get("fuentes", [])]))
        return merged

    def _with_structural_context(self, info: dict[str, Any] | None) -> dict[str, Any] | None:
        if not info or self._has_content(info):
            return info
        original = str(info.get("nombre_original") or "estructura sin nombre")
        systems = [str(value).replace("_", " ") for value in info.get("sistemas", [])]
        collections = [str(value) for value in info.get("colecciones_origen", [])[:4]]
        classification = ", ".join(systems) if systems else "clasificación anatómica pendiente"
        description = "Estructura registrada como «{}» y clasificada en {}.".format(original, classification)
        if collections:
            description += " En Z-Anatomy pertenece a: {}.".format("; ".join(collections))
        merged = dict(info)
        merged["descripcion_educativa"] = description
        merged["contenido_estructural"] = True
        return merged

    def _with_general_context(self, info: dict[str, Any] | None, model_src: str) -> dict[str, Any] | None:
        general = self.general_by_model.get(model_src)
        if not general and info:
            for path in info.get("archivos_glb", []):
                general = self.general_by_model.get("models/" + str(path).lstrip("/"))
                if general:
                    break
        if not general:
            return info
        if info and self._has_content(info):
            return info
        return self._merge_context(info, general, str(general.get("nombre_contexto") or "estructura anatómica"))

    def _merge_context(
        self,
        info: dict[str, Any] | None,
        context: dict[str, Any],
        context_name: str,
    ) -> dict[str, Any]:
        merged = {**context, **(info or {})}
        for field in ("ubicacion", "funcion_principal", "descripcion_educativa", "sistemas", "especialidades"):
            value = info.get(field) if info else None
            if self._missing(value):
                merged[field] = context.get(field)
        merged["fuentes"] = list(dict.fromkeys([*(info or {}).get("fuentes", []), *context.get("fuentes", [])]))
        merged["contenido_general_de"] = context_name
        return merged

    @staticmethod
    def _missing(value: Any) -> bool:
        return value is None or value == [] or str(value).strip() in ("", "pendiente", "por verificar")

    def _has_content(self, info: dict[str, Any]) -> bool:
        return not self._missing(info.get("descripcion_educativa"))

    def _refresh(self) -> None:
        try:
            main_stamp = self.path.stat().st_mtime
        except OSError:
            main_stamp = None
        try:
            general_stamp = self.general_path.stat().st_mtime
        except OSError:
            general_stamp = None
        try:
            verified_stamp = self.verified_path.stat().st_mtime if self.verified_path else None
        except OSError:
            verified_stamp = None
        stamp = (main_stamp, general_stamp, verified_stamp)
        if stamp == self.stamp:
            return
        fichas = _load_json_object(self.path).get("fichas", {})
        self.by_id = {
            key: value for key, value in fichas.items()
            if isinstance(key, str) and isinstance(value, dict)
        } if isinstance(fichas, dict) else {}
        self.by_name = {}
        for info in self.by_id.values():
            names = {str(info.get("nombre_original") or "")}
            names.update(str(name) for name in info.get("nombres_malla", []) if name)
            for name in names - {""}:
                self.by_name.setdefault(name, []).append(info)
        for matches in self.by_name.values():
            matches.sort(key=lambda info: info.get("tipo_ficha") != "pieza")
        general = _load_json_object(self.general_path).get("modelos", {})
        self.general_by_model = {
            key: value for key, value in general.items()
            if isinstance(key, str) and isinstance(value, dict)
        } if isinstance(general, dict) else {}
        verified = _load_json_object(self.verified_path) if self.verified_path else {}
        sources = verified.get("fuentes", {})
        concepts = verified.get("conceptos", {})
        assignments = verified.get("asignaciones", {})
        self.verified_by_id = {}
        if isinstance(sources, dict) and isinstance(concepts, dict) and isinstance(assignments, dict):
            for piece_id, assignment in assignments.items():
                if not isinstance(assignment, dict):
                    continue
                concept = concepts.get(assignment.get("concepto"))
                if not isinstance(concept, dict):
                    continue
                source_ids = concept.get("fuentes", [])
                source_details = [sources[key] for key in source_ids if key in sources]
                content = {**concept, **assignment}
                content["fuentes"] = source_ids
                content["fuentes_verificadas"] = source_details
                content.pop("concepto", None)
                if content.get("lateralidad") and content.get("nombre_es"):
                    content["nombre_es"] = "{} {}".format(content["nombre_es"], content["lateralidad"])
                self.verified_by_id[piece_id] = content
        self.stamp = stamp

    def _clear(self) -> None:
        self.stamp = None
        self.by_id = {}
        self.by_name = {}
        self.general_by_model = {}
        self.verified_by_id = {}


ANATOMY_CATALOG = AnatomyCatalog(INFO_CATALOG, GENERAL_INFO_CATALOG, VERIFIED_INFO_CATALOG)


def piece_info(piece_id: str = "", mesh_name: str = "", model_src: str = "") -> dict[str, Any] | None:
    return ANATOMY_CATALOG.find(piece_id, mesh_name, model_src)


def resolve_media_src(raw: Any) -> str | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    if raw.startswith("/") or raw.startswith("\\") or (len(raw) > 1 and raw[1] == ":"):
        return None

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

    def log_message(self, fmt: str, *args: Any) -> None:
        pass

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

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path

        if path in ("/", "/stage.html"):
            self._serve_stage_html()
            return
        if path == "/config":
            self._send_json({
                "name": CFG.get("name", "HeyTECHI"),
                "orbs": [
                    {"title": o.get("title", ""), "kind": o.get("kind", "")}
                    for o in CFG.get("orbs", []) if isinstance(o, dict)
                ],
            })
            return
        if path == "/models":
            self._send_json({"models": list_models()})
            return
        if path == "/piece-info":
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            piece_id = query.get("id", [""])[0]
            mesh_name = query.get("name", [""])[0]
            model_src = query.get("model", [""])[0]
            info = piece_info(piece_id, mesh_name, model_src)
            self._send_json({"info": info}, 200 if info else 404)
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
        for prefix, (root, types) in _STATIC_ROUTES.items():
            if path.startswith(prefix):
                self._serve_static(path[len(prefix):], root, types)
                return
        self.send_error(404)

    def _send_file(self, file_path: Path, content_type: str) -> None:
        try:
            body = file_path.read_bytes()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _serve_stage_html(self) -> None:
        self._send_file(REPO_ROOT / "stage.html", "text/html; charset=utf-8")

    def _serve_static(self, rel_url: str, root: Path, types: dict[str, str]) -> None:
        rel = urllib.parse.unquote(rel_url)
        candidate = (root / rel).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            self.send_error(404)
            return
        content_type = types.get(candidate.suffix.lower())
        if content_type is None or not candidate.is_file():
            self.send_error(404)
            return
        self._send_file(candidate, content_type)

    def do_POST(self) -> None:
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

    def translate_path(self, path: str) -> str:
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
