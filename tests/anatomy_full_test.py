from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server


FULL_PATH = ROOT / "media" / "Info" / "contenido_anatomico_completo.json"
PILOT_PATH = ROOT / "media" / "Info" / "contenido_verificado_piloto.json"
EXPECTED_BLOCKS = {
    "esqueletico",
    "muscular",
    "inserciones_musculares",
    "articulaciones",
    "cardiovascular",
    "nervioso_sentidos",
    "linfatico",
    "visceral",
    "regiones_cuerpo",
}
VALID_STATES = {"fuente_verificada", "contexto_medico_verificado"}
VALID_HOSTS = {"ifaa.net", "www.ncbi.nlm.nih.gov"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    complete = json.loads(FULL_PATH.read_text(encoding="utf-8"))
    pilot = json.loads(PILOT_PATH.read_text(encoding="utf-8"))
    catalog = json.loads(server.INFO_CATALOG.read_text(encoding="utf-8"))["fichas"]
    pieces = {key: value for key, value in catalog.items() if value.get("tipo_ficha") == "pieza"}
    sources = complete["fuentes"]
    concepts = complete["conceptos"]
    assignments = complete["asignaciones"]

    require(set(assignments) == set(pieces), "la cobertura no coincide con las piezas reales")
    require(set(pilot["asignaciones"]) <= set(assignments), "se perdieron asignaciones del piloto")
    require(all(urlparse(source["url"]).hostname in VALID_HOSTS for source in sources.values()), "hay una fuente fuera de los dominios autorizados")

    states = Counter()
    blocks = Counter()
    for piece_id, assignment in assignments.items():
        concept = concepts.get(assignment.get("concepto"))
        require(isinstance(concept, dict), f"concepto inexistente para {piece_id}")
        require(concept.get("estado_revision") in VALID_STATES, f"estado inválido para {piece_id}")
        require(concept.get("descripcion_educativa"), f"descripción vacía para {piece_id}")
        require(concept.get("ubicacion") and concept.get("funcion_principal"), f"ficha incompleta para {piece_id}")
        require(concept.get("fuentes"), f"sin fuentes para {piece_id}")
        require(set(concept["fuentes"]) <= set(sources), f"referencia rota para {piece_id}")
        states[concept["estado_revision"]] += 1
        if concept.get("bloque_revision"):
            blocks[concept["bloque_revision"]] += 1

    require(EXPECTED_BLOCKS <= set(blocks), "faltan bloques anatómicos")
    repository = server.AnatomyCatalog(server.INFO_CATALOG, server.GENERAL_INFO_CATALOG, FULL_PATH)
    for piece_id in assignments:
        info = repository.find(piece_id=piece_id)
        require(info and info.get("descripcion_educativa"), f"el endpoint no describe {piece_id}")
        require(info.get("fuentes_verificadas"), f"el endpoint no entrega fuentes para {piece_id}")
        require(info.get("estado_revision") in VALID_STATES, f"el endpoint pierde el estado de {piece_id}")

    print(f"catálogo anatómico completo: {len(assignments)} piezas, {len(concepts)} conceptos, {len(blocks)} bloques, 100% con fuente")
    print(f"estados por pieza: {dict(states)}")


if __name__ == "__main__":
    main()
