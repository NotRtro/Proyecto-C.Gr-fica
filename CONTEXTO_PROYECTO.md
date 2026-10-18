# HeyTECHI — Contexto del proyecto para continuar con una IA

> **Para qué sirve este archivo:** es el traspaso completo del proyecto. Una IA (o
> una persona) que lo lea debería poder continuar el trabajo sin la conversación
> original. Resume qué se construyó, cómo está organizado, qué reglas sigue el
> código, qué decisiones se tomaron (y por qué) y qué falta hacer.
>
> **Última actualización:** después de la **Fase 7** (gemelo digital: piezas,
> gestos de palma, sacar/encajar piezas y armado guiado con el Buggy). Rama
> `ronaldoPruebas`. Tests: `56 ok, 0 fallas`.

---

## 0. Cómo empezar una conversación nueva

Copia este mensaje a tu IA (adjuntando o pegando este archivo):

```text
Estoy desarrollando HeyTECHI, una app web para manipular hologramas 3D con las
manos (webcam + MediaPipe + three.js), pensada como gemelo digital: cargar un
modelo (por ejemplo una bicicleta), desarmarlo en piezas y volver a armarlo.
Lee CONTEXTO_PROYECTO.md: ahí está el estado, la arquitectura, las reglas del
código y lo que falta. Trabajamos por fases: primero me propones el plan de la
fase, lo apruebo, la implementas, la verificas (tests + navegador) y me das un
informe; yo pruebo con mi cámara y subo los cambios. Sigamos con la Fase 8.
Responde en español.
```

Archivos que la IA debería leer primero, en este orden:

1. Este archivo.
2. `docs/13-plan-interaccion-y-escalabilidad.md` (plan general por fases, con el
   registro detallado de cada fase hecha).
3. `docs/14-plan-mejora-menu.md` (plan y registro de la mejora del menú, pasos A–D).
4. `README.md` de la raíz (plan y estado de la Fase 7, tabla de uso).
5. `media/models/README.md` (qué modelos se pueden desarmar y el formato del manifest).
6. `js/core/config.js` (todos los umbrales del sistema en un solo lugar).
7. `tests/README.md` (cómo probar sin cámara).

> Ojo: `docs/` está en `.gitignore`. Si la IA trabaja sobre un clon del
> repositorio, **esos documentos no estarán**; este archivo sí. (Ver sección 10.)

---

## 1. Qué es HeyTECHI

- **Objetivo:** manipular hologramas con las manos frente a una webcam, al estilo
  "Iron Man", con foco en un **gemelo digital**: cargar un modelo 3D por piezas,
  **desarmarlo y armarlo** con gestos.
- **Origen:** empezó como una app de escritorio en Python (`run.py` + `core/*.py`,
  OpenCV + ModernGL). Se migró a la arquitectura web descrita en `docs/01`–`docs/10`
  (proyecto de referencia "barehands": https://github.com/jaredrhod/barehands).
  **La app Python sigue en el repo, intacta e independiente** (no se toca).
- **Nombre:** el proyecto se llama **HeyTECHI** (se ve en el orbe del menú y en el
  título de la página).

---

## 2. Estado actual

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Esqueleto web: `server.py` + `stage.html` + MediaPipe + tarjetas/imágenes | ✅ |
| 2 | Reactor holográfico (puerto del shader de `core/hologram.py` a three.js) | ✅ |
| 3 | Cimientos: `stage.html` partido en módulos `js/`, bus de eventos, registros | ✅ |
| 4 | Motor de gestos: ID estable por mano, árbitro de modos, dos manos, mouse, grabar/replay, tests | ✅ |
| 5 | Interfaz: menú, ayuda, salir, estados del cursor, tutorial, avisos | ✅ |
| — | Mejora del menú (docs/14): orbe flotante HeyTECHI, click vs arrastre, punto de intención, permanencia, calibración de la mano | ✅ (pasos A–D) |
| 6 | Catálogo 3D: modelos GLB, modo holo/sólido, explode por piezas, menú Modelos | ✅ (con el Buggy) |
| — | Mejoras previas a la 7: pinch con los otros tres dedos recogidos; modelos con su apariencia original (holo solo si no traen) | ✅ |
| 7 | Gemelo digital: piezas por jerarquía + manifest, raycast, palma de "alto"/"perilla", sacar y encajar piezas, armado guiado (pasos 7A–7E, ver README) | ✅ (con el Buggy) |
| **8** | **Pulido: bloom con alpha, oclusión de mano, OBS, compresión, rendimiento** | ⏳ **siguiente** |

**Probado con la cámara real del usuario:** fases 1–5, pasos A–B del menú y el
pinch cerrado + apariencia original (el usuario confirmó que "funciona de
maravilla"). **Falta confirmar con cámara:** paso C (permanencia, cerrar tocando
fuera, posición del orbe), calibración (paso D), la Fase 6 con gestos y **toda la
Fase 7** (sobre todo la palma "perilla", que depende de la profundidad z de
MediaPipe: si no es estable, plan B "volante", ver sección 9).

---

## 3. Cómo correrlo

### Requisitos
- **Python 3.12** (stdlib alcanza para `server.py`). El `.venv` del repo usa
  3.12.10; con 3.14 fallaban las dependencias de la app Python vieja (sin wheels
  de `moderngl`).
- **Node 18+** solo para los tests (no hay dependencias npm, no hay build).
- Navegador Chromium (Chrome/Edge) con webcam. Necesita internet: three.js y
  MediaPipe se cargan desde CDN (jsdelivr / storage.googleapis).

### Arrancar
```bash
python server.py
# abre http://127.0.0.1:8794/stage.html
```

| URL | Para qué |
|---|---|
| `/stage.html` | El tracker: cámara + gestos + escena + menú (lo que usa el operador) |
| `/stage.html?role=render` | Página para OBS: replica la escena con fondo transparente, sin cámara ni menú (`&cursors=0` oculta cursores, `&mirror=1` desactiva el espejo) |
| `/stage.html?replay=<nombre>` | Usa una grabación de `tests/recordings/` en vez de la cámara |
| `/stage.html?replay=<nombre>&step=1` | Igual, cuadro a cuadro con el tiempo de la grabación (pruebas reproducibles) |
| `/stage.html?calibrar=1` | Abre directo el asistente "Calibrar mis manos" |
| `/stage.html?cam=<texto>` | Elige la cámara cuyo nombre contenga ese texto |

**Teclas:** `M` menú · `Esc` cerrar menú · `H` panel de depuración · `C` cambiar
cámara · `G` grabar gestos (descarga un `.json`) · `R` recargar.

### Tests
```bash
npm test                      # o: node tests/run.mjs   -> 56 ok
node tests/make-recordings.mjs   # regenera las grabaciones sintéticas
node tests/calibrate.mjs <grabacion.json>   # calibración desde una grabación
```

### Modelos 3D
Copiar `.glb`/`.gltf` a `media/models/` (o `media/models/<carpeta>/model.glb` +
`manifest.json`). Aparecen en Menú → Modelos (botón "Actualizar catálogo").
Hoy hay uno: **`media/models/Buggy.glb`** (descargado de Khronos, ver sección 11)
con su manifest **`media/models/Buggy.json`** (16 piezas con nombre; sí se versiona).
Guía completa para modelos de clientes: `media/models/README.md`.

---

## 4. Arquitectura

### Flujo de un frame (tracker)
```
cámara (o ?replay=)                                  mouse
   │ detecciones MediaPipe (21 landmarks por mano)     │
hands.js ──── ID estable por mano (h1, h2…)            │
   │                                                    │
gestures.js ─ estado por mano: cursor (filtro One Euro),│
   │          ancla, pinch con histéresis, spanPx,       │
   │          palma ("stop" / "dial")                    │
   └──────────────► arbiter.js ◄─────────────────────────┘
                    modos: IDLE · GRAB · PIECE · TWO_HAND · EXPLODE · DIAL · LOCKED
                       │ (adapter)            │ (bus de eventos)
             stage/interaction.js       ui/pointer.js → menú, tutorial, calibración
                       │
              items (DOM + un canvas WebGL por modelo)
                       │
              net/sync.js → POST /state (30 Hz) → server.py → GET /state → página OBS
```

### Servidor (`server.py`, solo stdlib, `127.0.0.1:8794`)
| Ruta | Qué hace |
|---|---|
| `GET /` `/stage.html` | La página |
| `GET /js/*` `/css/*` `/recordings/*.json` | Archivos estáticos con jaula de rutas (no se puede salir de la carpeta) y MIME explícito |
| `GET /media/*` | Medios (imágenes, modelos) dentro de `media/` |
| `GET /models` | Catálogo de modelos 3D de `media/models` |
| `GET /config` | Nombre y orbs (sin rutas reales) |
| `GET/POST /state` | Último estado de la escena (lo publica el tracker; lo lee OBS) |
| `POST /cmd` | Comandos para una IA externa (allowlist + "airlock" de rutas de medios) |

Allowlist de `/cmd`: `add_img, add_card, clear, reset, hand, give, yank, hover,
scroll_note, widget, explode, assemble, present, load_model, remove_model`
(varias heredadas de barehands no tienen efecto todavía). Scripts de ejemplo:
`bin/board.sh` (enviar comando) y `bin/board-state.sh` (leer el tablero).

### Mapa de módulos (`js/`)
| Carpeta / archivo | Responsabilidad |
|---|---|
| `main.js` | Entrada: tracker o render page según `?role=` |
| `core/config.js` | **Todos los umbrales** (pinch, tap, manos, filtro, click/arrastre, apuntado, dos manos, explode, modelos) |
| `core/settings.js` | Preferencias del usuario en `localStorage` (+ aplica la calibración sobre los umbrales) |
| `core/store.js` | Estado único: `items`, `hands`, `activeId` (modelo activo)… |
| `core/bus.js` | Bus de eventos (lista completa de eventos en el comentario del archivo) |
| `input/hands.js` | Seguimiento de manos con ID estable; corrige la lateralidad de MediaPipe |
| `input/gestures.js` | Estado por mano: cursor filtrado, ancla, pinch, `spanPx` |
| `input/recognizers/pinch.js` | Métricas y transición del pinch (histéresis + 2 frames de confirmación); formas "ok" y "closed" |
| `input/recognizers/palm.js` | Palma de "alto" (quieta 0,6 s) y palma "perilla" (dedos a la cámara, usa la z de MediaPipe) |
| `input/filters.js` | Filtro One Euro |
| `input/arbiter.js` | Máquina de estados de gestos (puro, inyectado por adapter) |
| `input/pipeline.js` | Une las tres etapas anteriores (la usan tracker y tests) |
| `input/mouse.js` | Mouse como "mano virtual" |
| `input/recorder.js` | Grabar (G) y reproducir (`?replay=`, `&step=1`) |
| `input/calibration.js` | Análisis puro de la mano del usuario (calibración) |
| `items/registry.js` | Registro de tipos de ítem + alta/baja/serialización |
| `items/{card,image,ring,holo,model}.js` | Un archivo por tipo (`model` = GLB del catálogo) |
| `three/` | Geometría y shader del reactor, shader holo para GLB, plan de explode puro |
| `three/pieces.js` | **Puro (fase 7):** qué es una pieza (`findPieces`), agrupado por manifest, nombres, imán, orden y avance del armado guiado |
| `three/pieceRig.js` | three.js de las piezas: construirlas, ubicarlas (desarmado + usuario + encaje), raycast, resaltado, silueta, arrastre en el plano de la cámara, sincronía con OBS |
| `three/modelLook.js` | Puro: ¿el modelo trae apariencia propia? (si no, holográfico) |
| `stage/tracker.js` | Boot, loop de frames, teclas, HUD, salir |
| `stage/render.js` | Página para OBS |
| `stage/interaction.js` | Adapter DOM del árbitro + modelo activo |
| `stage/scene.js`, `stage/models.js` | Poblar/limpiar escena; agregar modelos (lugar libre, límite) |
| `ui/menu.js`, `ui/pages.js` | Orbe + panel en árbol; secciones y acciones |
| `ui/pointer.js` | Botones con mano/mouse: hover, click, mantener, arrastrar, permanencia |
| `ui/press.js`, `ui/targeting.js` | Lógica pura: click vs arrastre; a qué botón apunta la mano |
| `ui/tutorial.js`, `ui/calibration.js`, `ui/feedback.js`, `ui/cursors.js` | Tutorial, asistente de calibración, avisos/sonido, cursores |
| `ui/partHover.js`, `ui/guide.js` | Fase 7: etiqueta y resaltado de la pieza apuntada; indicador del armado guiado |
| `net/sync.js`, `net/catalog.js` | Publicar estado; catálogo de modelos |
| `commands.js` | Registro de comandos de `/cmd` |
| `css/ui.css` | Estética holográfica (cian translúcido) de toda la interfaz |

---

## 5. Reglas del código (respetarlas al continuar)

1. **Todo es un registro, no un `if`.** Tipos de ítem (`registerItemType`),
   comandos (`registerCommand`), acciones del menú (`registerAction`), páginas del
   menú (`registerMenuPage`). Agregar algo = agregar un archivo/registro.
2. **Lógica pura + adapter.** Todo lo que decide (gestos, árbitro, click vs
   arrastre, apuntado, calibración, explode) no toca el DOM y **tiene tests en
   Node** (`tests/run.mjs`). El DOM se conecta por adapters (`stage/interaction.js`,
   `ui/pointer.js`).
3. **Sin paso de compilación.** Módulos ES nativos servidos por `server.py`; three.js
   por import map (`three@0.160.0`). No agregar bundlers ni dependencias npm.
4. **Umbrales solo en `core/config.js`.** Nunca números mágicos en la lógica.
5. **Interfaz:** atributos `data-ui` (tapa la escena), `data-action` + `data-arg`
   (botón), `data-hold="ms"` (acción destructiva, mantener), `data-drag="<id>"`
   (arrastrable). No usar eventos `click` nativos: mouse y mano pasan por la misma
   tubería.
6. **Estilo:** comentarios del código en español **sin tildes** (convención
   existente); textos visibles para el usuario **con tildes**. Seguir la densidad
   de comentarios de los archivos vecinos.
7. **Protocolo:** coordenadas en el cable como **fracción de pantalla**; la render
   page aplica la "ley de espejo". El mouse no se publica.
8. **Verificar siempre:** `npm test` + prueba en el navegador. Para gestos sin
   cámara, usar grabaciones (`?replay=…&step=1`) y crear nuevas en
   `tests/synthetic.mjs` cuando haga falta.

---

## 6. Interacción actual (lo que el usuario puede hacer)

| Gesto (mano) | Mouse | Resultado |
|---|---|---|
| Pinch + arrastrar sobre un objeto | arrastrar | Moverlo. El pinch vale con los otros tres dedos estirados ("OK") o recogidos ("cerrado"); un puño no cuenta |
| Pinch rápido (< 300 ms, < 26 px) | clic | Tap (expandir tarjeta) |
| Pinch con **las dos manos** sobre el mismo objeto | rueda / Shift+rueda | Escalar (0,3×–3×) y rotar (yaw) |
| Pinch **en vacío** + arrastre horizontal | arrastrar en vacío | Desarmar (derecha) / armar (izquierda) el modelo activo |
| Pinch rápido sobre el **orbe HeyTECHI** | clic | Abrir/cerrar menú |
| Mantener el pinch 0,45 s sobre el orbe y mover | arrastrar | Mover el orbe (se recuerda la posición) |
| Pinch rápido en vacío con el menú abierto | clic en vacío | Cerrar menú |
| Dejar la mano quieta 0,8 s sobre una opción | — | Pulsarla (opcional: Ajustes) |
| Pasar la mano sobre un modelo **desarmado** | pasar el mouse | Resalta la pieza y muestra su nombre (con `H`, también sus números para el manifest) |
| Pinch sobre una pieza (modelo desarmado) y arrastrar | arrastrar | Sacarla; su lugar se ve como silueta cian. Soltarla cerca = encaja (imán) |
| Palma de **"alto"** quieta 0,6 s | Herramientas › Detener giro | Detiene / reanuda el giro del modelo bajo la mano (o el activo) |
| Palma **"perilla"**: dedos a la cámara + girar la muñeca | Shift+rueda | Gira el modelo poco a poco (queda detenido) |

**Menú (orbe + panel en árbol):** Modelos (catálogo, agregar/quitar, incluido el
reactor) · Herramientas (Desarmar, Armar, Armado guiado, Centrar, Detener/Reanudar
giro, Reiniciar escena [mantener]) ·
Vista (Modelos 3D: Original/Holográfico; reactor: wireframe, giro; depuración) ·
Gestos (ayuda + repetir tutorial) · Ajustes (permanencia, sonido, calibrar mis
manos, sensibilidad del pinch, cámara, reubicar orbe) · Salir [mantener 1,5 s].

**La escena no se bloquea con el menú abierto** (el panel solo tapa su área).

---

## 7. Decisiones tomadas (y por qué)

| Decisión | Motivo |
|---|---|
| Se **eliminó la palma abierta** como gesto | Pedido del usuario; no hacía falta y abría el menú sin querer |
| Se quitó el **anillo "Assistant"** de la escena | Pedido del usuario (molestaba); el tipo `widget` sigue registrado por compatibilidad |
| Menú = **orbe flotante + panel en árbol** (estilo barehands), no un panel lateral | Pedido del usuario (imagen de referencia) |
| Mover el orbe exige **mantener 450 ms**; un pinch rápido siempre es click | Antes el temblor (>12 px) convertía cada click en micro-arrastre |
| **Punto de intención**: se pulsa lo apuntado entre 350 y 100 ms *antes* del pinch | Al juntar los dedos el cursor salta 20–35 px |
| "Lo que se ve resaltado es lo que se pulsa" (histéresis + cursor magnético) | Coherencia; quedó confirmado al probar |
| Filtro One Euro en el cursor, **reiniciado al confirmar el pinch** | Sin reinicio, el salto de los dedos escalaba ~5 % los objetos a dos manos |
| Lateralidad de MediaPipe **invertida** en `detectionsFromMediaPipe` | MediaPipe supone imagen espejada y el video se le pasa sin espejar |
| **Calibración en la app** (no con grabaciones enviadas) | No había grabaciones reales; mide la mano de cada usuario |
| Sensibilidad del pinch = ajuste **relativo** (±0,07) sobre la calibración | Que ambas cosas convivan |
| Fase 6: **un canvas WebGL por modelo** (máx. 3), no una capa three.js única | Reutiliza arrastre/dos manos/explode; no bloquea la fase 7; capa única queda para la fase 8 si hace falta |
| Explode con **cámara que se aleja** (+50 %) | El modelo se ve grande armado y todas las piezas entran desarmado |
| Herramientas/explode actúan sobre el **modelo activo** (último tocado/agregado) | Hay varios modelos en escena |
| Pinch **"cerrado"** además del "OK": sin la firma OK se exige que las puntas se toquen (ratio x0,6) y que el índice no esté metido en la palma (`f8 > 0,9`) | Pedido del usuario; el puño (f8 ~0,75) sigue sin contar. Umbrales en `PINCH_CLOSED` |
| Modelos con **apariencia original** por defecto; holográficos solo si no traen texturas ni colores propios (`js/three/modelLook.js`) | Pedido del usuario. El Buggy no tiene texturas pero sí colores, así que se ve original. La preferencia pasó de `modelMode` a `modelLook` para que no pese el "holo" ya guardado |
| Pieza = **ensamble de la jerarquía** del glTF (hijos del primer nodo que se ramifica), no cada malla | Una rueda de 3 mallas se mueve entera; funciona con cualquier modelo separado en objetos, sin configurar nada |
| Piezas solo con el modelo **desarmado** (≥ 30 %); armado, el pinch mueve el modelo entero | Decisión del usuario; evita el choque entre "mover el modelo" y "tomar una pieza" |
| El modelo se agarra por su **silueta** (raycast), no por todo el cuadro de 560 px | Un pinch en un hueco del cuadro es "vacío" (desarmar/armar) |
| Manifest = **grupos de piezas automáticas** (`parts: [N...]`, números que muestra la etiqueta con `H`) + `rest` | Fácil de escribir para un cliente sin abrir Blender |
| Arrastre de piezas en el **plano paralelo a la pantalla** que pasa por su centro; el imán se mide **en pantalla** (7 % del cuadro) | "Acercarla a su lugar" es visual; la profundidad no se controla con la mano |
| Palma de **"alto"** reintroducida (antes se quitó para el menú) pero solo para el giro, con quietud + 500 ms tras soltar un pinch | Pedido del usuario; protegida contra la mano que se abre al soltar |
| Modelos GLB empiezan en **vista 3/4** (`MODEL.START_RY`) | De frente, el desarmado de un modelo largo va hacia la cámara y las piezas se tapan |
| Un raycast por punto y frame (memorizado); sin BVH | Medido: 0,35 ms por raycast sobre el Buggy completo (532 mil triángulos) |

---

## 8. Trampas conocidas (ahorran horas)

- **Windows permite dos servidores en el mismo puerto.** Si un cambio en
  `server.py` "no se aplica" (p. ej. una ruta da 404), hay un `server.py` viejo
  escuchando. Ver con `netstat -ano | findstr :8794` y cerrar todos.
- **MIME de `.js` en Windows:** el registro puede servir `text/plain` y romper los
  módulos ES; `server.py` fuerza `text/javascript` (no quitarlo).
- **Pestañas en segundo plano pausan `requestAnimationFrame`:** los replays en
  tiempo real pierden gestos cortos. Para pruebas usar `&step=1`.
- **El primer frame de un replay reinicia escena y menú** (cada vuelta es
  idéntica); abrir el menú justo al cargar puede "cerrarse solo".
- **Herramientas de inspección de navegadores** (javascript en "mundo aislado")
  cargan *otra* instancia de los módulos: para verificar, leer el DOM o `/state`.
- **Audio:** el click sonoro no suena hasta una interacción real (tecla o clic).
- **Contextos WebGL limitados** (~16 por página): por eso el máximo de 3 modelos.
- **Panel del navegador oculto (Claude Code):** `requestAnimationFrame` se detiene;
  cada captura de pantalla avanza un frame. Para probar arrastres sin cámara,
  disparar `pointerdown`/`pointermove`/`pointerup` y tomar una captura entre cada uno.
- **Los comandos `/cmd` enviados justo al recargar** los puede consumir la página
  anterior: esperar a que cargue antes de enviarlos.
- **Nombres de nodos:** GLTFLoader los "sanea" (`Wheel_FL.001` → `Wheel_FL001`); por
  eso `pieceRig.js` lee el nombre crudo de `parser.json.nodes`.
- **`docs/` y `media/**/*.glb` están en `.gitignore`** (ver sección 10).

---

## 9. Lo que falta

### Fase 7 — hecha (falta probar con cámara)

Plan, estado por paso y tabla de uso en el `README.md` de la raíz. Resumen:

- **7A** piezas por jerarquía, raycast con resaltado + etiqueta, agarre por silueta,
  decodificadores Draco/Meshopt, avisos para modelos de 1 pieza o con esqueleto.
- **7B** palma de "alto" (detener/reanudar giro) y palma "perilla" (girar).
  **Plan B si la perilla no es estable con la cámara:** "volante" = palma de alto
  inclinada (ángulo de la línea de nudillos sin depender de la z). El ángulo ya se
  calcula igual (`stepPalm`); solo cambiaría la pose que lo activa.
- **7C/7D** sacar piezas (rol `piece` del árbitro), silueta del lugar original,
  imán + animación, todas encajadas = el modelo se arma; estado de piezas en
  `/state` (`items[].pieces = [[i, ux, uy, uz, encajada], ...]`) para OBS.
- **7E** `media/models/Buggy.json` (16 piezas con nombre y orden; `rest: "Chasis"`),
  armado guiado (Herramientas), guía `media/models/README.md`.

Qué falta probar/ajustar con la cámara real:
1. Palma "perilla": que MediaPipe dé una `prof=` (panel `H`) clara (> 1) con los
   dedos a la cámara. Si no, plan B.
2. Palma de "alto": que no se dispare al soltar un pinch ni al pasar la mano.
3. Tomar piezas chicas con la mano (si cuesta, agrandar el modelo con dos manos
   antes, o subir `PIECES.SNAP_FRAC`).
4. Nombres izquierda/derecha del manifest del Buggy (supuesto: el frente es +z,
   donde está el parachoques).

### Fase 8 — Pulido
- **Bloom con alpha** (docs/04: el bloom estándar de three.js rompe la transparencia de OBS; hace falta un rig propio de render targets).
- **Oclusión de mano** (portar `HandOcclusion` de `core/hologram.py`: proxy de profundidad de la mano para que tape al holograma).
- Página OBS: probar con OBS real; cursores y modelos.
- **Compresión** de modelos (Draco/Meshopt con gltf.report) y rendimiento (capa three.js única si hace falta).
- Animación "dissolve" del reactor (existe el uniform, no hay gesto/comando).

### Pendientes menores / backlog
- **Rotación pitch** (inclinar el modelo) no implementada (solo yaw).
- **Modelo de la bicicleta:** conseguirlo segmentado (Sketchfab con filtro
  Downloadable, CGTrader, GrabCAD) o segmentarlo en Blender (`P` → By Loose Parts).
- **Probar con cámara real:** calibración, Fases 6 y 7 con gestos, OBS.
- La página de OBS no muestra el resaltado, la silueta ni la pista del armado
  guiado (son ayudas del operador); decidir si se publican.
- Comando `/cmd` para el armado guiado (hoy solo desde el menú).
- **Grabaciones reales** del usuario (tecla G) para tests y calibración.
- Decidir si se versionan `docs/` y los modelos `.glb` (hoy no se suben).
- Varias acciones heredadas de barehands en la allowlist sin efecto
  (`give`, `yank`, `hover`, `scroll_note`, `widget`, `present`).

### Decisiones tomadas para la Fase 7
1. Tomar una pieza = pinch sobre ella, **solo con el modelo desarmado**.
2. Nombres del Buggy con **manifest** (la bicicleta se agrega cuando exista, con el mismo formato).
3. La palma de "alto" afecta **solo al modelo de delante**.

---

## 10. Archivos que NO están en git

| Qué | Por qué | Qué hacer |
|---|---|---|
| `docs/*` (incluye docs/13 y docs/14) | `.gitignore` tiene `/docs/*` | Quitar esa línea si se quieren versionar; mientras tanto, este archivo resume lo esencial |
| `media/models/*.glb` (Buggy) | `.gitignore` ignora medios pesados | Cada integrante descarga el modelo (sección 11). Los manifest `.json` y `media/models/README.md` **sí** se versionan |
| `barehands.json`, `state/*` | Config local y estado de ejecución | `server.py` usa valores por defecto si faltan |

---

## 11. Recursos

- **Buggy (y otros ensamblajes por piezas):**
  https://github.com/KhronosGroupArchives/glTF-Sample-Models → `2.0/Buggy/glTF-Binary/Buggy.glb`
  (también `2CylinderEngine`, `GearboxAssy`).
- **Buscar modelos:** Sketchfab (filtro *Downloadable*, mirar el *Model Inspector*),
  CGTrader (gratis), GrabCAD (CAD por piezas), Poly Pizza, Kenney, Quaternius.
- **Revisar/comprimir GLB:** https://gltf.report (árbol de nodos, triángulos, Draco/Meshopt).
- **Proyecto de referencia:** https://github.com/jaredrhod/barehands
- **Documentación interna:** `docs/01`–`docs/10` (arquitectura de barehands:
  render, gestos, física, protocolo, OBS), `docs/13` (plan por fases + registro),
  `docs/14` (mejora del menú), `tests/README.md` (pruebas).

---

## 12. Forma de trabajo acordada con el usuario

- Idioma: **español**.
- Por fase: **plan → aprobación → implementación → verificación (tests +
  navegador) → informe** con: qué se hizo, cómo se verificó, qué probar con la
  cámara, archivos tocados y mensaje de commit sugerido.
- **El usuario hace los commits** (rama `ronaldoPruebas`); la IA no sube nada.
- Ante problemas encontrados al probar, explicarlos con causa y arreglo.
- Preferir verificar en el navegador con grabaciones (`&step=1`) cuando no hay cámara.
