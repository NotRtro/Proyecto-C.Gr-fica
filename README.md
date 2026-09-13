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
