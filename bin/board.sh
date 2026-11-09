#!/bin/sh
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

if [ "$#" -lt 1 ]; then
    echo "uso: $0 '<json>'" >&2
    exit 1
fi

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

curl -sS -X POST \
    -H "Content-Type: application/json" \
    -d "$1" \
    "http://127.0.0.1:${PORT}/cmd"
echo
