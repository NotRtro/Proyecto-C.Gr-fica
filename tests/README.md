# Tests de gestos

Prueban el motor de gestos (`js/input/`) sin camara ni navegador: cada grabacion
de `recordings/` se reproduce por la misma tuberia que usa el tracker
(`hands.js` -> `gestures.js` -> `arbiter.js`) sobre una escena falsa.

```bash
node tests/run.mjs          # o: npm test
node tests/make-recordings.mjs   # regenera las grabaciones sinteticas
```

Requiere Node 18+. No hay dependencias que instalar.

## Grabaciones

| Archivo | Que prueba |
|---|---|
| `pinch_drag.json` | agarrar el reactor, arrastrarlo +200 px y soltar sin salto |
| `tap.json` | tap rapido (aunque al soltar salte el punto medio) y pinch lento que NO es tap |
| `two_hand.json` | dos manos: escala x2, giro 20 grados, y la mano restante sigue arrastrando |
| `explode_drag.json` | pinch en vacio + arrastre horizontal = explode/assemble; vertical no hace nada |
| `hand_swap.json` | MediaPipe alterna Left/Right y pierde la mano 100 ms: el objeto no se suelta |
| `menu_orb_click.json` | grab rapido sobre el orbe (con temblor) abre el menu |
| `menu_orb_drag.json` | mantener y mover el orbe lo arrastra sin abrir el menu |
| `menu_select.json` | elegir filas: el punto de intencion corrige el salto al juntar los dedos |
| `menu_dwell.json` | elegir filas dejando la mano quieta (opcion de permanencia) |
| `calibration.json` | protocolo de calibracion con valores conocidos |
| `pinch_closed.json` | pinch con medio, anular y menique recogidos: agarra y arrastra igual que el pinch OK |
| `pinch_mixed.json` | pinch OK que se cierra a mitad del arrastre: no se suelta |
| `fist.json` | prueba negativa: un puno (incluso con el pulgar sobre la punta del indice) no es pinch |
| `palm.json` | palma de "alto" quieta 1,6 s: detiene el giro una sola vez (ni pinch ni tap) |
| `palm_stop.json` | palma de "alto": moviendose no dispara; quieta detiene; otra vez reanuda |
| `palm_dial.json` | palma "perilla" (dedos a la camara, con profundidad z): girar la muneca 40 grados gira el modelo |
| `palm_negative.json` | soltar un pinch abriendo la mano y un puno hacia la camara no son gestos de palma |

Las de esta carpeta son **sinteticas** (`synthetic.mjs` arma las manos a partir
de poses). Tambien se pueden ver en el navegador:
`http://127.0.0.1:8794/stage.html?replay=two_hand`.

## Grabar una sesion real

1. Abre el tracker con camara y pulsa **G** (aparece `● REC` abajo a la izquierda).
2. Haz el gesto y pulsa **G** otra vez: se descarga `grabacion-<fecha>.json`.
3. Copiala a `tests/recordings/` con un nombre claro y reproducela con
   `?replay=<nombre>`. Para usarla como test, agrega su caso en `run.mjs`.

Una grabacion puede traer `"setup"`: comandos `/cmd` que se aplican al empezar
cada vuelta del replay (por ejemplo, la tarjeta que usa `tap.json`).

## Replay cuadro a cuadro

`?replay=<nombre>&step=1` avanza un frame de la grabacion por frame de pantalla y
usa el tiempo de la grabacion: el resultado no depende de la velocidad del
navegador (util si la pestana pinta a saltos).

## Calibrar desde una grabacion

```bash
node tests/calibrate.mjs tests/recordings/calibration.json
```

Graba con la tecla G siguiendo el protocolo (3 s mano abierta y quieta, 2 s en
pinch, 4 veces pinch y soltar) y pasa el archivo a este comando. La app tiene el
mismo analisis en Ajustes > "Calibrar mis manos".
