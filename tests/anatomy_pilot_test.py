from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server


PILOT_PATH = ROOT / "media" / "Info" / "contenido_verificado_piloto.json"
REQUIRED_FIELDS = (
    "nombre_es",
    "nombre_anatomico_latin",
    "ubicacion",
    "funcion_principal",
    "descripcion_educativa",
    "fuentes",
    "confianza_vinculacion",
    "estado_revision",
)
PLACEHOLDERS = {"", "pendiente", "por verificar"}
ALLOWED_SOURCE_HOSTS = {"ifaa.net", "www.ncbi.nlm.nih.gov"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    pilot = json.loads(PILOT_PATH.read_text(encoding="utf-8"))
    catalog = json.loads(server.INFO_CATALOG.read_text(encoding="utf-8"))["fichas"]
    sources = pilot["fuentes"]
    concepts = pilot["conceptos"]
    assignments = pilot["asignaciones"]

    require(len(assignments) == 50, f"se esperaban 50 mallas, hay {len(assignments)}")
    require(len(concepts) == 33, f"se esperaban 33 conceptos, hay {len(concepts)}")
    require(set(assignments) <= set(catalog), "hay asignaciones que no existen en el catálogo")

    for source_id, source in sources.items():
        host = urlparse(source.get("url", "")).hostname
        require(host in ALLOWED_SOURCE_HOSTS, f"fuente no autorizada: {source_id}")
        require(source.get("organizacion") and source.get("titulo"), f"fuente incompleta: {source_id}")

    for concept_id, concept in concepts.items():
        for field in REQUIRED_FIELDS:
            require(field in concept, f"{concept_id} no tiene {field}")
        for field in REQUIRED_FIELDS[:5]:
            require(str(concept[field]).strip().lower() not in PLACEHOLDERS, f"{concept_id} tiene {field} pendiente")
        require(concept["estado_revision"] == "fuente_verificada", f"estado inválido en {concept_id}")
        require(float(concept["confianza_vinculacion"]) >= 0.95, f"confianza baja en {concept_id}")
        require(concept["fuentes"], f"{concept_id} no tiene fuentes")
        require(set(concept["fuentes"]) <= set(sources), f"fuente inexistente en {concept_id}")

    repository = server.AnatomyCatalog(server.INFO_CATALOG, server.GENERAL_INFO_CATALOG, PILOT_PATH)
    for piece_id in assignments:
        info = repository.find(piece_id=piece_id)
        require(info is not None, f"el servidor no encuentra {piece_id}")
        require(info.get("estado_revision") == "fuente_verificada", f"el servidor no prioriza el piloto en {piece_id}")
        require(info.get("fuentes_verificadas"), f"el servidor no entrega trazabilidad en {piece_id}")
        require(not info.get("contenido_estructural"), f"{piece_id} cayó en la ficha estructural")

    reuse = 1 - len(concepts) / len(assignments)
    print(f"piloto anatómico: {len(assignments)} mallas, {len(concepts)} conceptos, {reuse:.0%} de reutilización, 100% con fuente")


if __name__ == "__main__":
    main()
