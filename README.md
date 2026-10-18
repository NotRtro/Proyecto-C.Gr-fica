# Proyecto-C.Gr-fica

Este proyecto muestra un objeto 3D sobre la imagen de la cámara y permite
controlarlo con gestos de las manos.

## Requisitos

- Python 3.11 o 3.12
- cámara web
- soporte para OpenGL 3.3

## Instalación

Abre PowerShell dentro de esta carpeta y ejecuta:

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

## Ejecución

```powershell
.venv\Scripts\python.exe run.py
```

Para usar otra cámara:

```powershell
.venv\Scripts\python.exe run.py 1
```

## Gestos

| Gesto | Acción |
|---|---|
| pinza | mover el objeto |
| dos pinzas | cambiar el tamaño |
| apuntar | girar el objeto |
| abrir la mano | separar las partes |
| mostrar la palma | unir las partes |

Cerrar la mano no hace desaparecer el objeto.

## Teclas

| Tecla | Acción |
|---|---|
| `O` | activar o desactivar la oclusión |
| `P` | mostrar el modelo de profundidad de la mano |
| `G` | mostrar la geometría de la mano |
| `X` | activar o desactivar los efectos visuales |
| `D` | disolver o mostrar el objeto |
| `E` | separar o unir las partes |
| `T` | activar o desactivar la predicción |
| `Y` | cambiar entre ajuste automático y manual |
| `,` y `.` | ajustar la predicción manualmente |
| `R` | reiniciar el objeto |
| `H` | ocultar la información en pantalla |
| `Q` o `Esc` | salir |

## Archivos principales

```text
run.py               inicia el programa
requirements.txt     contiene las dependencias
assets/              contiene el modelo de detección de manos
core/                contiene la lógica del proyecto
```

## HeyTECHI (app web)

Este repositorio también contiene, en paralelo y sin relación de código con lo
anterior, la app web **HeyTECHI**: hologramas 3D que se manipulan con las manos
frente a la webcam (MediaPipe + three.js), pensada como **gemelo digital**:
cargar un modelo por piezas, desarmarlo y volver a armarlo. Se puede controlar
desde una IA externa por HTTP y tiene una vista transparente para OBS. No
reemplaza ni comparte código con `run.py`/`core/`.

Ejecución (Python 3.12, solo la biblioteca estándar):

```powershell
python server.py
```

Luego abre `http://127.0.0.1:8794/stage.html` (control, con cámara) o
`http://127.0.0.1:8794/stage.html?role=render` (vista transparente para OBS).
Tests sin cámara: `npm test` (Node 18+, sin dependencias).

Estado completo, arquitectura y reglas del código: [CONTEXTO_PROYECTO.md](CONTEXTO_PROYECTO.md).

### Modelos 3D

Copia archivos `.glb`/`.gltf` a `media/models/` y aparecen en Menú › Modelos.
Requisitos para poder desarmarlos: [media/models/README.md](media/models/README.md).

### Plan de la Fase 7: gemelo digital

Objetivo: **el Buggy se desarma y se vuelve a armar pieza por pieza, guiado, con
gestos y también con el mouse.** Sirve para cualquier modelo separado en piezas;
el `manifest.json` (nombres, grupos, orden de armado) es opcional.

| Paso | Contenido | Estado |
|---|---|---|
| 7A | Piezas y apuntado: pieza = ensamble de la jerarquía del GLB; raycast en el canvas de cada modelo (resalta la pieza y muestra su nombre); el modelo se agarra por su silueta; decodificadores Draco/Meshopt | ✅ |
| 7B | Gestos de palma: palma de "alto" quieta 0,6 s detiene/reanuda el giro del modelo; palma "perilla" (dedos hacia la cámara + girar la muñeca) lo rota poco a poco. Plan B si la cámara no lo sigue bien: "volante" (palma de alto inclinada) | ✅ (falta probar con cámara) |
| 7C | Sacar una pieza: con el modelo desarmado, pinch sobre una pieza la toma y la arrastra en el plano de la cámara; se publica en `/state` (OBS) | ✅ |
| 7D | Encajar: silueta fantasma en su lugar original, imán al soltarla cerca, animación; todas en su lugar = modelo armado | ✅ |
| 7E | Armado guiado + `manifest.json` del Buggy (16 piezas con nombre y orden); "paso 3 de 16: …"; armado libre para modelos sin manifest; guía de modelos para clientes | ✅ |

Decisiones tomadas:
- Con el modelo **armado**, el pinch mueve el modelo entero; con el modelo
  **desarmado**, el pinch sobre una pieza la toma.
- Detener el giro con la palma afecta **solo al modelo de delante** (el que está
  bajo la mano o, si no hay ninguno, el último tocado).
- Modelo de prueba: **Buggy** (Khronos glTF Sample Models).

Cada paso se entrega con tests (`npm test`), grabaciones sintéticas para verlo en
el navegador (`stage.html?replay=<nombre>&step=1`) y se prueba con la cámara real.

**Cómo se usa (fase 7):**

| Gesto | Mouse | Qué hace |
|---|---|---|
| Pinch en vacío + arrastrar a la derecha | arrastrar en vacío | Desarma el modelo (a la izquierda lo arma) |
| Pasar la mano sobre el modelo desarmado | pasar el mouse | Resalta la pieza y muestra su nombre (con `H`, también sus números) |
| Pinch sobre una pieza y arrastrar | arrastrar la pieza | La saca; su lugar original se ve como silueta |
| Soltarla cerca de su silueta | soltar | Encaja (imán). Todas encajadas = el modelo se arma solo |
| Palma de "alto" quieta 0,6 s | Herramientas › Detener giro | Detiene / reanuda el giro de ese modelo |
| Palma con los dedos hacia la cámara + girar la muñeca | Shift + rueda | Gira el modelo poco a poco |
| Menú › Herramientas › Armado guiado | — | Armado pieza por pieza en orden; la que toca brilla en ámbar |
