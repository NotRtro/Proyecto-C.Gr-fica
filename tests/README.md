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
| `palm.json` | palma abierta sostenida dispara 1 vez; palma corta no |

Las de esta carpeta son **sinteticas** (`synthetic.mjs` arma las manos a partir
de poses). Tambien se pueden ver en el navegador:
`http://127.0.0.1:8794/stage.html?replay=two_hand`.

## Grabar una sesion real

1. Abre el tracker con camara y pulsa **G** (aparece `● REC` arriba a la derecha).
2. Haz el gesto y pulsa **G** otra vez: se descarga `grabacion-<fecha>.json`.
3. Copiala a `tests/recordings/` con un nombre claro y reproducela con
   `?replay=<nombre>`. Para usarla como test, agrega su caso en `run.mjs`.

Una grabacion puede traer `"setup"`: comandos `/cmd` que se aplican al empezar
cada vuelta del replay (por ejemplo, la tarjeta que usa `tap.json`).
