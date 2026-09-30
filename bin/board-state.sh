#!/bin/sh
# Lee /state y lo traduce a una descripcion textual. Son los ojos de una IA
# sobre el tablero.
#
# Uso:
#   bin/board-state.sh
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

PY=""
for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
        if "$candidate" -c "print(1)" >/dev/null 2>&1; then
            PY="$candidate"
            break
        fi
    fi
done
if [ -z "$PY" ]; then
    echo "no se encontro un interprete de Python real (revisa el stub de Windows Store)" >&2
    exit 1
fi

PORT=$("$PY" - "$ROOT_DIR" <<'EOF'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
port = 8794
for name in ("barehands.json", "barehands.json.example"):
    p = root / name
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            port = data.get("port", port)
        except Exception:
            pass
        break
print(port)
EOF
)

curl -sS "http://127.0.0.1:${PORT}/state" | "$PY" - <<'EOF'
import json
import sys

try:
    st = json.load(sys.stdin)
except Exception as e:
    print("no se pudo leer /state:", e)
    sys.exit(1)

items = st.get("items", [])
cursors = st.get("cursors", {})
ring = st.get("ring", {})

print("--- tablero ---")
print("anillo: {} (mood {})".format(ring.get("state", "?"), ring.get("mood", "?")))
print("manos activas: {}".format(len(cursors)))
if not items:
    print("sin items en escena")
else:
    print("{} item(s):".format(len(items)))
    for it in items:
        titulo = it.get("title") or it.get("src") or "(sin titulo)"
        x = it.get("x", 0.0)
        y = it.get("y", 0.0)
        grabbed = " [agarrado]" if it.get("g") else ""
        print("  - [{}] {} @ ({:.2f}, {:.2f}){}".format(
            it.get("type", "?"), titulo, x, y, grabbed))
EOF
