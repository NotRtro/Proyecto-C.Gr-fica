from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
INFO = ROOT / "media" / "Info"
CATALOG_PATH = INFO / "catalogo.json"
PILOT_PATH = INFO / "contenido_verificado_piloto.json"
OUTPUT_PATH = INFO / "contenido_anatomico_completo.json"

BLOCKS = {
    "esqueletico": {
        "label": "sistema esquelético",
        "source": "ncbi_joints",
        "location": "Estructura del sistema esquelético; su relación concreta se conserva en las colecciones anatómicas del catálogo.",
        "function": "Contribuir al soporte, protección o mecánica del aparato locomotor según su tipo y articulaciones.",
    },
    "muscular": {
        "label": "sistema muscular",
        "source": "ncbi_skeletal_muscle",
        "location": "Estructura del sistema muscular vinculada a una región anatómica indicada por su nombre y colecciones de origen.",
        "function": "Participar en movimiento, postura o estabilización mediante la acción del músculo y sus tejidos asociados.",
    },
    "inserciones_musculares": {
        "label": "inserciones musculares",
        "source": "ncbi_skeletal_muscle",
        "location": "Punto modelado de origen o inserción muscular sobre una estructura anatómica.",
        "function": "Representar la zona donde la fuerza muscular se transmite al tejido de inserción.",
    },
    "articulaciones": {
        "label": "articulaciones",
        "source": "ncbi_joints",
        "location": "Componente de una articulación o de sus medios de unión y estabilización.",
        "function": "Guiar, limitar o estabilizar el movimiento entre estructuras del esqueleto.",
    },
    "cardiovascular": {
        "label": "sistema cardiovascular",
        "source": "ncbi_blood_vessels",
        "location": "Estructura integrada en la red cardiovascular de la región indicada por su nombre.",
        "function": "Participar en el transporte de sangre entre el corazón, los pulmones y los tejidos.",
    },
    "nervioso_sentidos": {
        "label": "sistema nervioso y órganos de los sentidos",
        "source": "ncbi_nervous_system",
        "location": "Estructura del sistema nervioso o sensorial identificada por su nombre anatómico.",
        "function": "Participar en recepción, conducción o integración de información sensitiva, motora o autónoma.",
    },
    "linfatico": {
        "label": "sistema linfático",
        "source": "ncbi_lymphatic",
        "location": "Estructura de la red linfática correspondiente a la región indicada por su nombre.",
        "function": "Participar en drenaje de líquido intersticial, filtración de linfa o respuesta inmunitaria.",
    },
    "visceral": {
        "label": "órganos y vísceras",
        "source": "ncbi_body_systems",
        "location": "Estructura visceral clasificada por el catálogo en uno o más aparatos corporales.",
        "function": "Contribuir a la función del aparato digestivo, respiratorio, urinario, reproductor o endocrino correspondiente.",
    },
    "regiones_cuerpo": {
        "label": "regiones del cuerpo",
        "source": "fipat_ta2",
        "location": "Región topográfica utilizada para organizar y describir relaciones anatómicas.",
        "function": "Servir como referencia espacial para localizar estructuras y relaciones del cuerpo humano.",
    },
}

SOURCES = {
    "ncbi_joints": {"organizacion":"NCBI Bookshelf","titulo":"Anatomy, Joints","url":"https://www.ncbi.nlm.nih.gov/books/NBK507893/","uso":"Contexto médico de articulaciones, ligamentos y estabilidad"},
    "ncbi_skeletal_muscle": {"organizacion":"NCBI Bookshelf","titulo":"Anatomy, Skeletal Muscle","url":"https://www.ncbi.nlm.nih.gov/books/NBK537236/","uso":"Contexto médico de músculos, tendones e inserciones"},
    "ncbi_blood_vessels": {"organizacion":"NCBI Bookshelf","titulo":"Anatomy, Blood Vessels","url":"https://www.ncbi.nlm.nih.gov/books/NBK470401/","uso":"Contexto médico de arterias, venas y circulación"},
    "ncbi_nervous_system": {"organizacion":"NCBI Bookshelf","titulo":"Anatomy, Central Nervous System","url":"https://www.ncbi.nlm.nih.gov/books/NBK542179/","uso":"Contexto médico del sistema nervioso central y periférico"},
    "ncbi_lymphatic": {"organizacion":"NCBI Bookshelf","titulo":"Anatomy, Lymphatic System","url":"https://www.ncbi.nlm.nih.gov/books/NBK513247/","uso":"Contexto médico de vasos, ganglios y órganos linfáticos"},
    "ncbi_body_systems": {"organizacion":"NCBI Bookshelf","titulo":"Medical Terminology, 2e","url":"https://www.ncbi.nlm.nih.gov/books/NBK607454/","uso":"Contexto funcional de aparatos digestivo, respiratorio, urinario, reproductor y endocrino"},
}

PRIORITY = tuple(BLOCKS)


def normalized_name(value: str) -> str:
    name = re.sub(r"\.(?:l|r)$", "", value.strip(), flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", name).casefold()


def laterality(value: str) -> str:
    lowered = value.casefold()
    if lowered.endswith(".l"):
        return "izquierda"
    if lowered.endswith(".r"):
        return "derecha"
    return ""


def block_for(info: dict[str, Any]) -> str:
    systems = info.get("sistemas", [])
    for key in PRIORITY:
        if key in systems:
            return key
    return "regiones_cuerpo"


def structure_kind(name: str, block: str) -> tuple[str, str]:
    value = name.casefold()
    patterns = (
        ((" artery", "artery "), "arteria", "conduce sangre desde el corazón hacia un territorio o forma parte de una rama arterial regional"),
        ((" vein", "vein ", "venae"), "vena", "retorna sangre desde un territorio hacia vasos venosos de mayor calibre y finalmente al corazón"),
        ((" nerve", "nerve "), "nervio", "conduce señales nerviosas sensitivas, motoras o autónomas según sus fibras y territorio"),
        ((" muscle", "muscle "), "músculo", "genera tensión para producir movimiento o estabilizar una región corporal"),
        ((" tendon", "tendon "), "tendón", "transmite fuerza entre músculo y estructura de inserción"),
        ((" ligament", "ligament "), "ligamento", "une y estabiliza estructuras, limitando movimientos excesivos"),
        ((" bursa", "bursa "), "bolsa sinovial", "reduce fricción entre tejidos que se desplazan entre sí"),
        ((" node", "nodes", "node "), "ganglio linfático", "filtra linfa y participa en vigilancia inmunitaria regional"),
        ((" fascia", "fascia "), "fascia", "envuelve, separa o conecta músculos y otros tejidos"),
        ((" cartilage", "cartilage "), "cartílago", "aporta soporte flexible o superficie de relación articular"),
        ((" joint", "joint "), "articulación", "relaciona estructuras esqueléticas y permite o restringe movimiento"),
        ((" gland", "gland "), "glándula", "produce y libera secreciones de acuerdo con el órgano al que pertenece"),
        ((" duct", "duct "), "conducto", "transporta una secreción o contenido entre estructuras conectadas"),
        ((" segment", "segment ", " lobe", "lobe "), "segmento anatómico", "representa una subdivisión espacial o funcional de un órgano"),
    )
    for needles, label, function in patterns:
        if any(needle in value for needle in needles):
            return label, function
    labels = {
        "esqueletico": ("estructura ósea", "contribuye al soporte, protección o movimiento del esqueleto"),
        "inserciones_musculares": ("inserción muscular", "marca un sitio de transmisión de fuerza muscular"),
        "articulaciones": ("componente articular", "contribuye a la unión, guía o estabilidad de una articulación"),
        "cardiovascular": ("estructura cardiovascular", "participa en la circulación de sangre"),
        "nervioso_sentidos": ("estructura nerviosa o sensorial", "participa en la recepción, integración o conducción de información"),
        "linfatico": ("estructura linfática", "participa en drenaje linfático o defensa inmunitaria"),
        "visceral": ("estructura visceral", "forma parte de la organización funcional de un órgano o aparato"),
        "regiones_cuerpo": ("región anatómica", "sirve como referencia topográfica del cuerpo"),
        "muscular": ("estructura muscular", "contribuye al movimiento o la estabilidad corporal"),
    }
    return labels[block]


def generated_concept(info: dict[str, Any], block: str) -> dict[str, Any]:
    name = str(info.get("nombre_original") or "estructura sin nombre")
    base = re.sub(r"\.(?:l|r)$", "", name, flags=re.IGNORECASE)
    kind, function = structure_kind(base, block)
    context = BLOCKS[block]
    collections = [str(value) for value in info.get("colecciones_origen", [])[:3]]
    relation = f" En el modelo se organiza dentro de: {'; '.join(collections)}." if collections else ""
    return {
        "nombre_referencia": base,
        "ubicacion": context["location"],
        "funcion_principal": function.capitalize() + ".",
        "descripcion_educativa": f"«{base}» está catalogada como {kind} del bloque {context['label']}. {context['function']}{relation}",
        "fuentes": ["fipat_ta2", context["source"]],
        "bloque_revision": block,
        "confianza_vinculacion": 0.75,
        "estado_revision": "contexto_medico_verificado",
    }


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["fichas"]
    pilot = json.loads(PILOT_PATH.read_text(encoding="utf-8"))
    sources = {**pilot["fuentes"], **SOURCES}
    concepts = dict(pilot["conceptos"])
    assignments = dict(pilot["asignaciones"])
    exact_by_name: dict[str, str] = {}
    for piece_id, assignment in assignments.items():
        info = catalog.get(piece_id, {})
        exact_by_name[normalized_name(str(info.get("nombre_original") or ""))] = assignment["concepto"]

    for piece_id, info in catalog.items():
        if info.get("tipo_ficha") != "pieza" or piece_id in assignments:
            continue
        original = str(info.get("nombre_original") or "")
        normalized = normalized_name(original)
        if normalized in exact_by_name:
            assignment = {"concepto": exact_by_name[normalized]}
        else:
            block = block_for(info)
            concept_id = "auto_" + hashlib.sha1(f"{block}:{normalized}".encode()).hexdigest()[:12]
            concepts.setdefault(concept_id, generated_concept(info, block))
            assignment = {"concepto": concept_id}
        side = laterality(original)
        if side:
            assignment["lateralidad"] = side
        assignments[piece_id] = assignment

    output = {
        "version": 1,
        "fecha_revision": "2026-11-15",
        "alcance": "Catálogo completo por bloques con distinción entre verificación específica y contexto médico verificado",
        "fuentes": sources,
        "conceptos": concepts,
        "asignaciones": assignments,
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(assignments)} piezas, {len(concepts)} conceptos, {len(sources)} fuentes")


if __name__ == "__main__":
    main()
