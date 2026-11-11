#!/usr/bin/env python3
"""API mínima y CLI para consultar fichas por ID de malla o de ficha."""
from __future__ import annotations

import json
import sys
from pathlib import Path

CATALOG_PATH = Path(__file__).with_name("catalogo.json")


class CatalogoAnatomico:
    def __init__(self, path: Path = CATALOG_PATH):
        self.data = json.loads(path.read_text(encoding="utf-8"))

    def consultar(self, identifier: str) -> dict:
        ficha_id = self.data["mesh_to_ficha"].get(identifier, identifier)
        ficha = self.data["fichas"].get(ficha_id)
        if ficha is None:
            return {"encontrado": False, "id_consultado": identifier, "estado": "id_no_encontrado"}
        piece = self.data["fichas"].get(identifier) if identifier != ficha_id else None
        return {
            "encontrado": True,
            "id_consultado": identifier,
            "ficha_id": ficha_id,
            "estado": ficha["estado_revision"],
            "ficha": ficha,
            "pieza_seleccionada": piece,
        }


def consultar(identifier: str) -> dict:
    return CatalogoAnatomico().consultar(identifier)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python3 catalogo_anatomico/consultar_catalogo.py ID")
    print(json.dumps(consultar(sys.argv[1]), ensure_ascii=False, indent=2))
