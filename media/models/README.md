# Modelos 3D de HeyTECHI

Copia aquí archivos `.glb` o `.gltf` y aparecen en **Menú › Modelos** (botón
"Actualizar catálogo" si la app ya estaba abierta). Dos formas válidas:

```text
media/models/Buggy.glb               (+ opcional Buggy.json con el manifest)
media/models/bicicleta/model.glb     (+ opcional bicicleta/manifest.json)
```

Los `.glb` no se suben al repositorio (están en `.gitignore`): cada integrante los
descarga. El Buggy de prueba sale de los
[glTF Sample Models de Khronos](https://github.com/KhronosGroupArchives/glTF-Sample-Models)
(`2.0/Buggy/glTF-Binary/Buggy.glb`). Su manifest (`Buggy.json`) sí se versiona.

## ¿Mi modelo se podrá desarmar?

La app no conoce ningún modelo en particular: lee las **piezas** de la estructura
del archivo. Una pieza es un *ensamble* de la jerarquía (por ejemplo una rueda
hecha de llanta, rin y buje se mueve entera).

| Cómo viene el modelo | Qué pasa |
|---|---|
| Separado en objetos (exportado de CAD o Blender, ensamblajes) | Se desarma, se apuntan, sacan y encajan piezas, sin configurar nada |
| **Una sola malla** (escaneos 3D, muchos modelos "de juego") | Se mueve y escala, pero no se desarma. La app avisa al cargarlo. Solución: en Blender, modo edición, `P` › *By Loose Parts* (o *By Material*) y exportar de nuevo |
| Personaje con esqueleto (animado) | Se mueve, pero no se desarma (la app avisa) |
| Comprimido con Draco o Meshopt | Funciona (la app trae los decodificadores) |
| Texturas KTX2/Basis | Todavía no soportado: exportar con PNG/JPG |

Recomendaciones:

- **Tamaño:** menos de ~10 MB y menos de ~1 millón de triángulos. Para
  reducirlo: [gltf.report](https://gltf.report) (Draco o Meshopt).
- **Nombres:** si las piezas tienen nombre en Blender ("Rueda_DI",
  "Manillar"...), la app los muestra. Sin nombre se ven como "Pieza 12".
- **Apariencia:** si el modelo trae texturas o colores se ve con ellos; si no
  trae nada, se ve holográfico (Menú › Vista puede forzar holográfico).
- **Orientación:** glTF usa "Y hacia arriba"; Blender lo convierte solo al exportar.

## El manifest (opcional)

Un JSON junto al modelo para dar nombres, agrupar piezas y fijar el orden del
**armado guiado**. Ejemplo (es el del Buggy, abreviado):

```json
{
  "name": "Buggy",
  "rest": "Chasis",
  "pieces": [
    { "label": "Chasis", "parts": [32, 33, 34, 35, 66, 67, 68] },
    { "label": "Eje trasero", "parts": [122] },
    { "label": "Rueda trasera izquierda", "parts": [126] }
  ]
}
```

| Campo | Para qué |
|---|---|
| `name` | Nombre en el catálogo del menú |
| `pieces` | Piezas con nombre, **en el orden del armado guiado**. `parts` son los números de las piezas automáticas que forman cada una |
| `rest` | (opcional) Nombre de la pieza que se lleva las piezas automáticas no mencionadas. Sin `rest`, cada una queda como pieza suelta |

**Cómo saber los números de las piezas automáticas:** carga el modelo, desármalo
(pinch en vacío y arrastrar a la derecha, o Menú › Herramientas › Desarmar), abre
el panel de depuración con la tecla **H** y pasa la mano o el mouse por encima de
cada pieza: la etiqueta muestra su nombre y sus números (por ejemplo
`Pieza 12 · #12`).

Si el manifest tiene un error (JSON inválido) la app lo ignora y usa las piezas
automáticas. Los números repetidos o que no existen se descartan.

## Armado guiado

Menú › Herramientas › **Armado guiado**: el modelo se desarma y las piezas se
encajan en orden. La que toca brilla en ámbar y su lugar se ve como una silueta;
una pieza fuera de turno no encaja. Sin manifest, el orden va de la pieza más
grande a la más chica. **Terminar armado guiado** (mismo botón) vuelve al
armado libre: con el modelo desarmado, cualquier pieza se saca y encaja en
cualquier orden. Al encajar la última, el modelo se arma solo.
